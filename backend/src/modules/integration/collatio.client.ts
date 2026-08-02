import { randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import { httpGateway, type CallMeta } from './http-gateway.service.js';

/** Result of a document upload — the queued Collatio document id(s). */
export interface CollatioUploadResult {
  status: string;
  message: string;
  docIds: string[];
}

export interface ThreeWayMatchLine {
  line: string;
  description: string;
  po_qty: number;
  gr_qty: number;
  inv_qty: number;
  qty_match: boolean;
  po_price: number;
  inv_price: number;
  variance: number;
  price_match: boolean;
  po_total: number;
  inv_total: number;
  result: string;
}

export interface ThreeWayMatchResult {
  header: {
    invoice_no: string;
    bill_no: string;
    match_date: string;
    po_no: string;
    gr_no: string;
    ap_analyst: string;
    supplier: string;
    overall_result: string;
    approved: boolean;
  };
  lines: ThreeWayMatchLine[];
  totals: { po_total: number; inv_total: number; match: boolean };
  tolerances: { control: string; setting: string; result: string; status: string; ok: boolean }[];
  checks: { control: string; detail: string; result: string; status: string; ok: boolean }[];
  currency: string;
  outstanding: number;
  next_action: string;
}

export interface ThreeWayMatchPayload {
  material_request: string;
  purchase_receipt: string;
  purchase_order: string;
  purchase_invoice: string;
}

export interface UploadFile {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

/**
 * Client for the Collatio document/OCR API, routed through the HTTP gateway so
 * every call is logged. In `mock` mode (dev without VPN) it returns canned
 * responses in the exact shape the live service uses, and still records a log
 * row (flagged mock) so the flow is fully demoable and auditable.
 */
export class CollatioClient {
  private base(): string {
    return env.integrations.collatio.ocrBaseUrl.replace(/\/+$/, '');
  }
  private get mock(): boolean {
    return env.integrations.collatio.mock || !env.integrations.collatio.ocrBaseUrl;
  }

  /** POST /collatio/upload (multipart). Returns the queued document id(s). */
  async uploadDocument(input: {
    transactionId: string;
    docType: string;
    file: UploadFile;
    meta?: CallMeta;
  }): Promise<CollatioUploadResult> {
    const url = `${this.base()}/collatio/upload`;
    const clientName = env.integrations.collatio.clientName;
    const summary = `multipart: transaction_id=${input.transactionId}, doc_type=${input.docType}, client_name=${clientName}, file=${input.file.filename}`;

    if (this.mock) {
      const docId = randomBytes(12).toString('hex');
      const response = {
        message: 'Upload request processed',
        result: { Status: 'success', Message: '1 file(s) queued for processing.', Data: [docId] },
      };
      httpGateway.recordMock(
        { provider: 'collatio', operation: 'upload', method: 'POST', url, bodySummary: summary, meta: input.meta },
        response,
      );
      return { status: 'success', message: response.result.Message, docIds: response.result.Data };
    }

    const form = new FormData();
    form.append('transaction_id', input.transactionId);
    form.append('doc_type', input.docType);
    form.append('client_name', clientName);
    form.append('file', new Blob([input.file.buffer], { type: input.file.mimetype }), input.file.filename);

    const res = await httpGateway.request<{ message: string; result: { Status: string; Message: string; Data: string[] } }>({
      provider: 'collatio',
      operation: 'upload',
      method: 'POST',
      url,
      data: form,
      headers: { accept: 'application/json' },
      bodySummary: summary,
      meta: input.meta,
    });
    return { status: res.result?.Status ?? 'success', message: res.result?.Message ?? '', docIds: res.result?.Data ?? [] };
  }

  /** POST /collatio/validate-and-reconcile (JSON). Returns the three-way-match result. */
  async validateAndReconcile(payload: ThreeWayMatchPayload, meta?: CallMeta): Promise<ThreeWayMatchResult> {
    const url = `${this.base()}/collatio/validate-and-reconcile`;
    if (this.mock) {
      const response = mockMatch(payload);
      httpGateway.recordMock(
        { provider: 'collatio', operation: 'validate-and-reconcile', method: 'POST', url, data: payload, meta },
        response,
      );
      return response;
    }
    return httpGateway.request<ThreeWayMatchResult>({
      provider: 'collatio',
      operation: 'validate-and-reconcile',
      method: 'POST',
      url,
      data: payload,
      headers: { 'Content-Type': 'application/json', accept: 'application/json' },
      meta,
    });
  }
}

/** Canned three-way-match result (dev), echoing the caller's document numbers. */
function mockMatch(p: ThreeWayMatchPayload): ThreeWayMatchResult {
  const lines: ThreeWayMatchLine[] = [
    line('L.001', 'Microsoft Azure Ent. Licence', 1, 42750),
    line('L.002', 'Dell PowerEdge R750 Server (x4)', 4, 11776),
    line('L.003', 'Cisco Catalyst 9300 Switch (x6)', 6, 3525),
    line('L.004', 'ServiceNow ITSM 100 Seats', 100, 162),
    line('L.005', 'IT Cabling & Rack Installation', 1, 14200),
  ];
  const poTotal = lines.reduce((s, l) => s + l.po_total, 0);
  return {
    header: {
      invoice_no: p.purchase_invoice,
      bill_no: p.material_request,
      match_date: '2026-06-09',
      po_no: p.purchase_order,
      gr_no: p.purchase_receipt,
      ap_analyst: 'Priya Nair',
      supplier: 'TechSource Global Ltd.',
      overall_result: 'MATCH — APPROVED FOR PAYMENT',
      approved: true,
    },
    lines,
    totals: { po_total: poTotal, inv_total: poTotal, match: true },
    tolerances: [
      { control: 'Price Variance', setting: '±2% of PO price', result: '0.00', status: 'WITHIN TOLERANCE', ok: true },
      { control: 'Quantity Variance', setting: '±0 units (strict)', result: '0 units', status: 'WITHIN TOLERANCE', ok: true },
      { control: 'Tax Amount', setting: 'Per GST Rules (18%)', result: '25452.72', status: 'COMPLIANT', ok: true },
    ],
    checks: [
      { control: 'Duplicate Check', detail: 'Vendor + Inv No + Amount', result: 'No duplicate', status: 'CLEAR', ok: true },
      { control: 'Vendor Verification', detail: 'Approved vendor master', result: 'TechSource Global Ltd. verified', status: 'CLEAR', ok: true },
    ],
    currency: 'INR',
    outstanding: 166856.72,
    next_action: 'Invoice approved for payment run',
  };
}

function line(id: string, description: string, qty: number, price: number): ThreeWayMatchLine {
  const total = qty * price;
  return {
    line: id,
    description,
    po_qty: qty,
    gr_qty: qty,
    inv_qty: qty,
    qty_match: true,
    po_price: price,
    inv_price: price,
    variance: 0,
    price_match: true,
    po_total: total,
    inv_total: total,
    result: 'PASS',
  };
}

export const collatioClient = new CollatioClient();
