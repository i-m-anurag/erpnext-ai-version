import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { BadRequestError } from '../../shared/errors.js';
import { requireAuth } from '../auth/index.js';
import { documentCancelService } from '../document/document-cancel.service.js';
import { documentDataService } from '../document/document-data.service.js';
import { ledgerService } from './ledger.service.js';
import { ledgerReportService } from './ledger-report.service.js';
import { ledgerSettingsService } from './ledger-settings.service.js';
import { fiscalYearService } from './fiscal-year.service.js';

/** Financial-ledger reads: General Ledger, Trial Balance, and a voucher's entries. */
export function buildLedgerRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/general-ledger', asyncHandler(async (req: Request, res: Response) => {
    const account = String(req.query.account ?? '');
    if (!account) throw new BadRequestError('account is required');
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;
    res.json(await ledgerReportService.generalLedger(account, from, to));
  }));

  router.get('/trial-balance', asyncHandler(async (_req: Request, res: Response) => {
    res.json(await ledgerReportService.trialBalance());
  }));

  router.get('/profit-and-loss', asyncHandler(async (req: Request, res: Response) => {
    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;
    res.json(await ledgerReportService.profitAndLoss(from, to));
  }));

  router.get('/balance-sheet', asyncHandler(async (_req: Request, res: Response) => {
    res.json(await ledgerReportService.balanceSheet(await fiscalYearService.lastCloseDate()));
  }));

  router.get('/fiscal-years', asyncHandler(async (_req: Request, res: Response) => {
    res.json({ fiscalYears: await fiscalYearService.list() });
  }));

  router.post('/fiscal-years/:id/close', asyncHandler(async (req: Request, res: Response) => {
    res.json(await fiscalYearService.close(String(req.params.id)));
  }));

  router.get('/payables', asyncHandler(async (_req: Request, res: Response) => {
    res.json({ rows: await ledgerReportService.partyAgeing('Payable') });
  }));

  router.get('/receivables', asyncHandler(async (_req: Request, res: Response) => {
    res.json({ rows: await ledgerReportService.partyAgeing('Receivable') });
  }));

  router.get('/voucher/:type/:no', asyncHandler(async (req: Request, res: Response) => {
    res.json({ entries: await ledgerService.forVoucher(String(req.params.type), String(req.params.no)) });
  }));

  /** Reverse a posted voucher (posts equal-and-opposite entries in EVERY ledger it
   *  touched) and mark the source document Cancelled. Idempotent — a second call is a
   *  no-op. Kept on this path because it is where the UI's Reverse button points; the
   *  work itself belongs to the document, which may have moved stock as well as money. */
  router.post('/reverse', asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { voucherType?: string; voucherNo?: string };
    const voucherType = String(body.voucherType ?? '');
    const voucherNo = String(body.voucherNo ?? '');
    if (!voucherType || !voucherNo) throw new BadRequestError('voucherType and voucherNo are required');
    const result = await documentCancelService.cancel(voucherType, voucherNo, new Date());
    // Best-effort: reflect the cancellation on the source document (documents only).
    try {
      const doc = await documentDataService.getByCode(voucherType, voucherNo);
      await documentDataService.setState(voucherType, doc.id, 'Cancelled');
    } catch {
      /* not a document / no state column — ignore */
    }
    res.json(result);
  }));

  router.get('/settings', asyncHandler(async (_req: Request, res: Response) => {
    res.json(await ledgerSettingsService.get());
  }));

  router.put('/settings', asyncHandler(async (req: Request, res: Response) => {
    const freezeDate = (req.body as { freezeDate?: string | null }).freezeDate ?? null;
    res.json(await ledgerSettingsService.set(freezeDate));
  }));

  return router;
}
