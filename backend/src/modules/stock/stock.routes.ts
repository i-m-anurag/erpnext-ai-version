import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireAuth } from '../auth/index.js';
import { stockReportService } from './stock-report.service.js';

/** Stock reads: on-hand balances, movement history, and a voucher's movements. */
export function buildStockRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  /** Current on-hand qty + value per item/warehouse. */
  router.get('/balance', asyncHandler(async (_req: Request, res: Response) => {
    res.json(await stockReportService.balances());
  }));

  /** Movement history, optionally narrowed by item and/or warehouse. */
  router.get('/ledger', asyncHandler(async (req: Request, res: Response) => {
    // A non-numeric ?limit must fall back to the default, not reach SQL as NaN (which
    // Postgres rejects with a 500). Number.isFinite catches '', 'abc' and Infinity.
    const rawLimit = Number(req.query.limit);
    res.json({
      rows: await stockReportService.ledger({
        itemCode: req.query.item ? String(req.query.item) : undefined,
        warehouse: req.query.warehouse ? String(req.query.warehouse) : undefined,
        limit: Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined,
      }),
    });
  }));

  /** Does the stock ledger agree with the Stock In Hand account? */
  router.get('/reconciliation', asyncHandler(async (_req: Request, res: Response) => {
    res.json(await stockReportService.reconciliation());
  }));

  /** The stock a single document moved (for a record's "Posted entries" panel). */
  router.get('/voucher/:type/:no', asyncHandler(async (req: Request, res: Response) => {
    res.json({ entries: await stockReportService.forVoucher(String(req.params.type), String(req.params.no)) });
  }));

  return router;
}
