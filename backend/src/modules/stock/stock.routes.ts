import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { requireAuth } from '../auth/index.js';
import { stockLedgerService } from './stock-ledger.service.js';
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
    res.json({
      rows: await stockReportService.ledger({
        itemCode: req.query.item ? String(req.query.item) : undefined,
        warehouse: req.query.warehouse ? String(req.query.warehouse) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      }),
    });
  }));

  /** The stock a single document moved (for a record's "Stock Entries" panel). */
  router.get('/voucher/:type/:no', asyncHandler(async (req: Request, res: Response) => {
    res.json({ entries: await stockLedgerService.forVoucher(String(req.params.type), String(req.params.no)) });
  }));

  return router;
}
