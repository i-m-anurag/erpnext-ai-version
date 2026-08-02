import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { asyncHandler } from '../../shared/async-handler.js';
import { BadRequestError } from '../../shared/errors.js';
import { requireAuth } from '../auth/index.js';
import { requirePermission } from '../permission/index.js';
import { collatioService } from './collatio.service.js';
import { integrationLogService } from './integration-log.service.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

/**
 * Third-party integration endpoints: the Collatio document flows plus read access
 * to the outbound-API audit log. Every Collatio call underneath routes through the
 * HTTP gateway, so it lands in api_call_log regardless of these handlers.
 */
export function buildIntegrationRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  // Per-form integration config (drives UI affordances) — any authed user may read.
  router.get('/config/:slug', asyncHandler(async (req: Request, res: Response) => {
    res.json(await collatioService.configFor(String(req.params.slug)));
  }));

  // Feature 1 — upload a document to Collatio and create a linked draft record.
  router.post(
    '/collatio/upload',
    requirePermission('master', 'create'),
    upload.single('file'),
    asyncHandler(async (req: Request, res: Response) => {
      const slug = String(req.body?.slug ?? '');
      if (!slug) throw new BadRequestError('slug is required');
      if (!req.file) throw new BadRequestError('file is required');
      const result = await collatioService.uploadAndCreate({
        slug,
        file: { buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype },
        actorUserId: req.auth!.userId,
      });
      res.status(201).json(result);
    }),
  );

  // Stream a record's uploaded document back to the browser.
  router.get('/collatio/document/:slug/:code', asyncHandler(async (req: Request, res: Response) => {
    const { absPath, filename } = await collatioService.documentPathForRecord(
      String(req.params.slug),
      String(req.params.code),
    );
    res.download(absPath, filename);
  }));

  // Feature 2 — three-way match for an invoice.
  router.post(
    '/collatio/three-way-match',
    requirePermission('master', 'view'),
    asyncHandler(async (req: Request, res: Response) => {
      const invoice = String(req.body?.invoice ?? '');
      if (!invoice) throw new BadRequestError('invoice is required');
      res.json(await collatioService.threeWayMatch(invoice, req.auth!.userId));
    }),
  );

  // Outbound-API audit log (Admin viewer).
  router.get('/logs', requirePermission('integration', 'log.read'), asyncHandler(async (req: Request, res: Response) => {
    const provider = req.query.provider ? String(req.query.provider) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json(await integrationLogService.list({ provider, limit }));
  }));

  router.get('/logs/:id', requirePermission('integration', 'log.read'), asyncHandler(async (req: Request, res: Response) => {
    res.json(await integrationLogService.get(String(req.params.id)));
  }));

  return router;
}
