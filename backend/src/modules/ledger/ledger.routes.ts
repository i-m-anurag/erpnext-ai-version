import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { BadRequestError } from '../../shared/errors.js';
import { requireAuth } from '../auth/index.js';
import { ledgerService } from './ledger.service.js';
import { ledgerReportService } from './ledger-report.service.js';

/** Financial-ledger reads: General Ledger, Trial Balance, and a voucher's entries. */
export function buildLedgerRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/general-ledger', asyncHandler(async (req: Request, res: Response) => {
    const account = String(req.query.account ?? '');
    if (!account) throw new BadRequestError('account is required');
    res.json(await ledgerReportService.generalLedger(account));
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

  router.get('/voucher/:type/:no', asyncHandler(async (req: Request, res: Response) => {
    res.json({ entries: await ledgerService.forVoucher(String(req.params.type), String(req.params.no)) });
  }));

  return router;
}
