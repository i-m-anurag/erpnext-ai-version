import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configResolver } from '../config/index.js';
import { masterService } from '../master/master.service.js';
import { BaseRepository } from '../../shared/base.repository.js';
import { DocumentLink } from '../document/document-link.entity.js';
import { documentDataService } from '../document/document-data.service.js';
import { BadRequestError } from '../../shared/errors.js';
import { collatioClient, type ThreeWayMatchResult } from './collatio.client.js';
import { integrationConfigSchema, INTEGRATION_CONFIG_RESOURCE_TYPE, type IntegrationConfig } from './integration-config.schema.js';

/** Uploaded documents live at the repo root under assets/manual_upload/<slug>/<txn>/. */
const ASSETS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../assets/manual_upload');

export interface UploadResult {
  code: string;
  collatioDocId: string;
  transactionId: string;
  filePath: string;
}

/**
 * Orchestrates the two Collatio flows on top of the HTTP-gateway-backed client:
 *  1. upload → store the file → create a draft record stamped with the returned
 *     Collatio document id (the requisition controller then shows "Extraction in
 *     progress"), and
 *  2. three-way match → resolve the invoice's linked docs and validate/reconcile.
 */
export class CollatioService {
  private readonly links = new BaseRepository(DocumentLink);

  /** Effective per-form integration config, or an empty object if none is set. */
  async configFor(slug: string): Promise<IntegrationConfig> {
    const resolved = await configResolver
      .resolve<IntegrationConfig>(INTEGRATION_CONFIG_RESOURCE_TYPE, slug)
      .catch(() => null);
    return resolved?.definition ?? integrationConfigSchema.parse({ slug });
  }

  /** Upload a document to Collatio and create a linked draft record of `slug`. */
  async uploadAndCreate(input: {
    slug: string;
    file: { buffer: Buffer; originalname: string; mimetype: string };
    actorUserId?: string;
  }): Promise<UploadResult> {
    const cfg = await this.configFor(input.slug);
    if (!cfg.collatioUpload?.enabled) {
      throw new BadRequestError(`Collatio upload is not enabled for "${input.slug}"`);
    }
    const transactionId = randomUUID();
    const filename = safeName(input.file.originalname);

    // Persist the file under assets/manual_upload/<slug>/<transactionId>/<file>.
    const relDir = join(input.slug, transactionId);
    const absDir = join(ASSETS_ROOT, relDir);
    await mkdir(absDir, { recursive: true });
    await writeFile(join(absDir, filename), input.file.buffer);
    const relPath = join('assets', 'manual_upload', relDir, filename);

    // Hit the Collatio upload API (mock in dev) — logged via the gateway.
    const upload = await collatioClient.uploadDocument({
      transactionId,
      docType: cfg.collatioUpload.docType ?? 'document',
      file: { buffer: input.file.buffer, filename, mimetype: input.file.mimetype },
      meta: { correlationId: transactionId, entityType: input.slug, actorUserId: input.actorUserId },
    });
    const collatioDocId = upload.docIds[0] ?? '';

    // Create a DRAFT record stamped with the Collatio ids + stored file path. The
    // extra keys land in the doc's `extra` jsonb (no schema change needed).
    const created = await masterService.createData(
      input.slug,
      {
        collatioDocId,
        collatioTransactionId: transactionId,
        collatioFileName: filename,
        collatioFilePath: relPath,
        ...(input.slug === 'requisition' ? { materialRequestType: 'Purchase' } : {}),
      },
      true,
    );

    return { code: created.code, collatioDocId, transactionId, filePath: relPath };
  }

  /** Resolve the stored file's absolute path for a record, guarding path traversal. */
  async documentPathForRecord(slug: string, code: string): Promise<{ absPath: string; filename: string }> {
    const row = await documentDataService.getByCode(slug, code);
    const rel = row.data['collatioFilePath'];
    const name = row.data['collatioFileName'];
    if (typeof rel !== 'string' || !rel) throw new BadRequestError('no uploaded document for this record');
    // rel is "assets/manual_upload/<slug>/<txn>/<file>"; resolve against the repo root.
    const abs = resolve(ASSETS_ROOT, '../..', rel);
    if (!abs.startsWith(ASSETS_ROOT)) throw new BadRequestError('invalid document path');
    return { absPath: abs, filename: typeof name === 'string' ? name : 'document' };
  }

  /** Run a three-way match for an invoice, resolving its linked MR/PO/PR codes. */
  async threeWayMatch(invoiceCode: string, actorUserId?: string): Promise<ThreeWayMatchResult> {
    const related = await this.relatedCodes(invoiceCode);
    return collatioClient.validateAndReconcile(
      {
        purchase_invoice: invoiceCode,
        material_request: related.requisition ?? 'MR-2026-000123',
        purchase_order: related.get('purchase-order') ?? 'PO-2026-000789',
        purchase_receipt: related.get('purchase-receipt') ?? 'PR-2026-000456',
      },
      { correlationId: invoiceCode, entityType: 'purchase-invoice', entityId: invoiceCode, actorUserId },
    );
  }

  /** Collect codes of documents linked to the invoice, keyed by their master slug. */
  private async relatedCodes(invoiceCode: string): Promise<Map<string, string> & { requisition?: string }> {
    const rows = await this.links.find({
      where: [
        { fromMaster: 'purchase-invoice', fromCode: invoiceCode },
        { toMaster: 'purchase-invoice', toCode: invoiceCode },
      ],
    });
    const map = new Map<string, string>() as Map<string, string> & { requisition?: string };
    for (const l of rows) {
      if (l.fromMaster !== 'purchase-invoice') map.set(l.fromMaster, l.fromCode);
      if (l.toMaster !== 'purchase-invoice') map.set(l.toMaster, l.toCode);
    }
    map.requisition = map.get('requisition');
    return map;
  }
}

/** Strip path separators / control chars from an uploaded filename. */
function safeName(name: string): string {
  return (name.split(/[\\/]/).pop() ?? 'document').replace(/[^\w.\- ]+/g, '_').slice(0, 180) || 'document';
}

export const collatioService = new CollatioService();
