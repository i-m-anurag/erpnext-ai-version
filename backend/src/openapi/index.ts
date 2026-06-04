import type { Express, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from './openapi.document.js';

/**
 * Mount interactive API docs (Swagger UI) at /docs and the raw spec at
 * /openapi.json. The document is generated from the same Zod schemas that
 * validate requests, so it can't drift from the implementation.
 */
export function mountApiDocs(app: Express): void {
  const document = buildOpenApiDocument();

  app.get('/openapi.json', (_req: Request, res: Response) => {
    res.json(document);
  });

  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(document, { customSiteTitle: 'ERP API Docs' }),
  );
}
