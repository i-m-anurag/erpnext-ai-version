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

  /**
   * Suggested three-way-match references for an invoice, resolved from its
   * document links and its own `purchaseReceipt` field. Any that can't be found
   * come back empty — the caller confirms/fills them before running the match
   * (we never invent document numbers).
   */
  async resolveMatchRefs(invoiceCode: string): Promise<MatchRefs> {
    const links = await this.relatedCodes(invoiceCode);
    let purchaseReceipt = links.get('purchase-receipt') ?? '';
    if (!purchaseReceipt) {
      // The Purchase Invoice form carries a purchaseReceipt field — use it as a fallback.
      const inv = await documentDataService.getByCode('purchase-invoice', invoiceCode).catch(() => null);
      const field = inv?.data['purchaseReceipt'];
      if (typeof field === 'string') purchaseReceipt = field;
    }
    return {
      invoice: invoiceCode,
      materialRequest: links.get('requisition') ?? '',
      purchaseOrder: links.get('purchase-order') ?? '',
      purchaseReceipt,
    };
  }

  /**
   * Run a three-way match. All four document numbers must be supplied (resolved
   * from the invoice's links/fields and confirmed by the user) — there is no
   * placeholder/sample fallback, so a live reconcile only ever runs on real docs.
   */
  async threeWayMatch(refs: MatchRefs, actorUserId?: string): Promise<ThreeWayMatchResult> {
    const invoice = refs.invoice?.trim() ?? '';
    const materialRequest = refs.materialRequest?.trim() ?? '';
    const purchaseOrder = refs.purchaseOrder?.trim() ?? '';
    const purchaseReceipt = refs.purchaseReceipt?.trim() ?? '';

    const missing = [
      !invoice && 'Purchase Invoice',
      !materialRequest && 'Material Request',
      !purchaseOrder && 'Purchase Order',
      !purchaseReceipt && 'Purchase Receipt',
    ].filter(Boolean);
    if (missing.length) {
      throw new BadRequestError(`Three-way match needs the linked ${missing.join(', ')}.`);
    }

    return collatioClient.validateAndReconcile(
      {
        purchase_invoice: invoice,
        material_request: materialRequest,
        purchase_order: purchaseOrder,
        purchase_receipt: purchaseReceipt,
      },
      { correlationId: invoice, entityType: 'purchase-invoice', entityId: invoice, actorUserId },
    );
  }

  /** Collect codes of documents linked to the invoice, keyed by their master slug. */
  private async relatedCodes(invoiceCode: string): Promise<Map<string, string>> {
    const rows = await this.links.find({
      where: [
        { fromMaster: 'purchase-invoice', fromCode: invoiceCode },
        { toMaster: 'purchase-invoice', toCode: invoiceCode },
      ],
    });
    const map = new Map<string, string>();
    for (const l of rows) {
      if (l.fromMaster !== 'purchase-invoice') map.set(l.fromMaster, l.fromCode);
      if (l.toMaster !== 'purchase-invoice') map.set(l.toMaster, l.toCode);
    }
    return map;
  }
}

/** The four documents a three-way match reconciles. */
export interface MatchRefs {
  invoice: string;
  materialRequest: string;
  purchaseOrder: string;
  purchaseReceipt: string;
}

/** Strip path separators / control chars from an uploaded filename. */
function safeName(name: string): string {
  return (name.split(/[\\/]/).pop() ?? 'document').replace(/[^\w.\- ]+/g, '_').slice(0, 180) || 'document';
}

export const collatioService = new CollatioService();
