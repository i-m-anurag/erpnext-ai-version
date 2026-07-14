import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { BadRequestError } from '../../shared/errors.js';
import { requireAuth } from '../auth/index.js';
import { documentDataService } from '../document/document-data.service.js';
import { ledgerService } from './ledger.service.js';
import { ledgerReportService } from './ledger-report.service.js';

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

  router.get('/profit-and-loss', asyncHandler(async (_req: Request, res: Response) => {
    res.json(await ledgerReportService.profitAndLoss());
  }));

  router.get('/balance-sheet', asyncHandler(async (_req: Request, res: Response) => {
    res.json(await ledgerReportService.balanceSheet());
  }));

  router.get('/payables', asyncHandler(async (_req: Request, res: Response) => {
    res.json({ rows: await ledgerReportService.partyOutstanding('Payable') });
  }));

  router.get('/receivables', asyncHandler(async (_req: Request, res: Response) => {
    res.json({ rows: await ledgerReportService.partyOutstanding('Receivable') });
  }));

  router.get('/voucher/:type/:no', asyncHandler(async (req: Request, res: Response) => {
    res.json({ entries: await ledgerService.forVoucher(String(req.params.type), String(req.params.no)) });
  }));

  /** Reverse a posted voucher (posts equal-and-opposite entries) and mark the source
   *  document Cancelled. Idempotent — a second call is a no-op. */
  router.post('/reverse', asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { voucherType?: string; voucherNo?: string };
    const voucherType = String(body.voucherType ?? '');
    const voucherNo = String(body.voucherNo ?? '');
    if (!voucherType || !voucherNo) throw new BadRequestError('voucherType and voucherNo are required');
    const result = await ledgerService.reverse(voucherType, voucherNo, new Date());
    // Best-effort: reflect the cancellation on the source document (documents only).
    try {
      const doc = await documentDataService.getByCode(voucherType, voucherNo);
      await documentDataService.setState(voucherType, doc.id, 'Cancelled');
    } catch {
      /* not a document / no state column — ignore */
    }
    res.json(result);
  }));

  return router;
}
