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
    // The chain is Requisition → PO → Receipt → Invoice, linked pairwise, so the
    // requisition isn't a DIRECT link of the invoice — walk the link graph out
    // from the invoice to collect the nearest doc of each master.
    const byMaster: Record<string, string> = {};
    const visited = new Set<string>([`purchase-invoice|${invoiceCode}`]);
    let frontier: [string, string][] = [['purchase-invoice', invoiceCode]];
    for (let depth = 0; depth < 8 && frontier.length; depth++) {
      const rows = await this.links.find({
        where: frontier.flatMap(([m, c]) => [
          { fromMaster: m, fromCode: c },
          { toMaster: m, toCode: c },
        ]),
      });
      const next: [string, string][] = [];
      for (const l of rows) {
        for (const [m, c] of [
          [l.fromMaster, l.fromCode],
          [l.toMaster, l.toCode],
        ] as [string, string][]) {
          if (visited.has(`${m}|${c}`)) continue;
          visited.add(`${m}|${c}`);
          if (!byMaster[m]) byMaster[m] = c;
          next.push([m, c]);
        }
      }
      frontier = next;
    }

    let purchaseReceipt = byMaster['purchase-receipt'] ?? '';
    if (!purchaseReceipt) {
      // The Purchase Invoice form also carries a purchaseReceipt field — use it too.
      const inv = await documentDataService.getByCode('purchase-invoice', invoiceCode).catch(() => null);
      const field = inv?.data['purchaseReceipt'];
      if (typeof field === 'string') purchaseReceipt = field;
    }
    return {
      invoice: invoiceCode,
      materialRequest: byMaster['requisition'] ?? '',
      purchaseOrder: byMaster['purchase-order'] ?? '',
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
      !materialRequest && 'Requisition',
      !purchaseOrder && 'Purchase Order',
      !purchaseReceipt && 'Purchase Receipt',
    ].filter(Boolean);
    if (missing.length) {
      throw new BadRequestError(`Three-way match needs the linked ${missing.join(', ')}.`);
    }

    // Include the Collatio document ids of the requisition and invoice records so
    // Collatio can tie the reconcile back to the documents it parsed.
    const [invoiceDocId, requisitionDocId] = await Promise.all([
      this.collatioDocId('purchase-invoice', invoice),
      this.collatioDocId('requisition', materialRequest),
    ]);

    return collatioClient.validateAndReconcile(
      {
        purchase_invoice: invoice,
        requisition: materialRequest,
        purchase_order: purchaseOrder,
        purchase_receipt: purchaseReceipt,
        requisition_collatio_doc_id: requisitionDocId,
        purchase_invoice_collatio_doc_id: invoiceDocId,
      },
      { correlationId: invoice, entityType: 'purchase-invoice', entityId: invoice, actorUserId },
    );
  }

  /** The stored Collatio document id on a record, or '' if none / not found. */
  private async collatioDocId(slug: string, code: string): Promise<string> {
    if (!code) return '';
    const row = await documentDataService.getByCode(slug, code).catch(() => null);
    const id = row?.data['collatioDocId'];
    return typeof id === 'string' ? id : '';
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
