import type { FormDefinition } from '../models/api.models';

/**
 * JSON-style "view config" that drives both the List (table) and Record (form)
 * screens for an entity — generated, not hand-coded per entity. Mock/static for
 * now; later resolved from the backend (form definition + a view config resource).
 */
export interface ListColumn {
  key: string;
  label: string;
  kind?: 'text' | 'mono' | 'chip' | 'date';
}

export interface WorkflowStage {
  code: string;
  name: string;
}

export interface ViewConfig {
  module: string;
  sub: string;
  title: string;
  singular: string;
  /** field used as the record id in the URL + row lookup */
  idKey: string;
  /** the dynamic-form definition for the record fields */
  form: FormDefinition;
  columns: ListColumn[];
  rows: Record<string, unknown>[];
  panels: { workflow?: boolean; timeline?: boolean; comments?: boolean };
  workflow?: { stages: WorkflowStage[]; current: string };
}

const ITEMS: ViewConfig = {
  module: 'inventory',
  sub: 'items',
  title: 'Items',
  singular: 'Item',
  idKey: 'sku',
  form: {
    slug: 'item',
    title: 'Item',
    layout: 'two-column',
    fields: [
      { key: 'sku', type: 'text', label: 'SKU', required: true, validators: { maxLength: 32 } },
      { key: 'name', type: 'text', label: 'Name', required: true, validators: { maxLength: 120 } },
      { key: 'category', type: 'select', label: 'Category', options: [
        { value: 'raw', label: 'Raw Material' }, { value: 'finished', label: 'Finished Good' }, { value: 'service', label: 'Service' },
      ] },
      { key: 'uom', type: 'select', label: 'Unit of Measure', options: [
        { value: 'EA', label: 'Each' }, { value: 'KG', label: 'Kilogram' }, { value: 'L', label: 'Litre' }, { value: 'BOX', label: 'Box' },
      ] },
      { key: 'reorderLevel', type: 'number', label: 'Reorder level', validators: { min: 0 } },
      { key: 'status', type: 'select', label: 'Status', options: [
        { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' },
      ] },
    ],
  },
  columns: [
    { key: 'sku', label: 'SKU', kind: 'mono' },
    { key: 'name', label: 'Name' },
    { key: 'category', label: 'Category', kind: 'chip' },
    { key: 'uom', label: 'UoM' },
    { key: 'reorderLevel', label: 'Reorder', kind: 'mono' },
    { key: 'status', label: 'Status', kind: 'chip' },
  ],
  rows: [
    { sku: 'ITM-1001', name: 'Steel Bolt M8', category: 'raw', uom: 'BOX', reorderLevel: 50, status: 'active' },
    { sku: 'ITM-1002', name: 'Aluminium Sheet 2mm', category: 'raw', uom: 'KG', reorderLevel: 120, status: 'active' },
    { sku: 'ITM-2001', name: 'Gearbox Assembly', category: 'finished', uom: 'EA', reorderLevel: 10, status: 'active' },
    { sku: 'ITM-2002', name: 'Hydraulic Pump', category: 'finished', uom: 'EA', reorderLevel: 5, status: 'inactive' },
    { sku: 'ITM-3001', name: 'Installation Service', category: 'service', uom: 'EA', reorderLevel: 0, status: 'active' },
    { sku: 'ITM-1003', name: 'Lubricant Oil', category: 'raw', uom: 'L', reorderLevel: 80, status: 'active' },
  ],
  panels: { timeline: true, comments: true },
};

const PURCHASE_ORDERS: ViewConfig = {
  module: 'procurement',
  sub: 'purchase-orders',
  title: 'Purchase Orders',
  singular: 'Purchase Order',
  idKey: 'poNumber',
  form: {
    slug: 'purchase-order',
    title: 'Purchase Order',
    layout: 'two-column',
    fields: [
      { key: 'poNumber', type: 'text', label: 'PO Number', required: true },
      { key: 'vendor', type: 'select', label: 'Vendor', required: true, options: [
        { value: 'Acme Supplies', label: 'Acme Supplies' }, { value: 'Globex Corp', label: 'Globex Corp' }, { value: 'Initech', label: 'Initech' },
      ] },
      { key: 'poDate', type: 'date', label: 'PO Date', required: true },
      { key: 'branch', type: 'select', label: 'Branch', options: [
        { value: 'hq', label: 'HQ' }, { value: 'plant1', label: 'Plant 1' }, { value: 'plant2', label: 'Plant 2' },
      ] },
      { key: 'paymentTerms', type: 'select', label: 'Payment Terms', options: [
        { value: 'net30', label: 'Net 30' }, { value: 'net60', label: 'Net 60' }, { value: 'advance', label: 'Advance' },
      ] },
      { key: 'deliveryDate', type: 'date', label: 'Delivery Date' },
      { key: 'notes', type: 'textarea', label: 'Notes' },
    ],
  },
  columns: [
    { key: 'poNumber', label: 'PO Number', kind: 'mono' },
    { key: 'vendor', label: 'Vendor' },
    { key: 'poDate', label: 'PO Date', kind: 'date' },
    { key: 'amount', label: 'Amount', kind: 'mono' },
    { key: 'status', label: 'Status', kind: 'chip' },
  ],
  rows: [
    { poNumber: 'PO-2026-0042', vendor: 'Acme Supplies', poDate: '2026-06-07', amount: '₹4,20,000', status: 'pending', paymentTerms: 'net30', branch: 'hq' },
    { poNumber: 'PO-2026-0041', vendor: 'Globex Corp', poDate: '2026-06-05', amount: '₹1,15,000', status: 'approved', paymentTerms: 'net60', branch: 'plant1' },
    { poNumber: 'PO-2026-0040', vendor: 'Initech', poDate: '2026-06-03', amount: '₹86,500', status: 'completed', paymentTerms: 'advance', branch: 'hq' },
    { poNumber: 'PO-2026-0039', vendor: 'Acme Supplies', poDate: '2026-06-01', amount: '₹2,40,000', status: 'draft', paymentTerms: 'net30', branch: 'plant2' },
  ],
  panels: { workflow: true, timeline: true, comments: true },
  workflow: {
    stages: [
      { code: 'mr', name: 'Material Req.' },
      { code: 'po', name: 'Purchase Order' },
      { code: 'pr', name: 'Goods Receipt' },
      { code: 'pi', name: 'Invoice' },
      { code: 'payment', name: 'Payment' },
    ],
    current: 'po',
  },
};

const VIEWS: ViewConfig[] = [ITEMS, PURCHASE_ORDERS];

export function getView(module: string, sub: string): ViewConfig | undefined {
  return VIEWS.find((v) => v.module === module && v.sub === sub);
}

/**
 * A ViewConfig that has been resolved for rendering. When `backed` is true the
 * form/columns/rows came from the backend master system and CRUD round-trips to
 * the API (`masterSlug` + `ids` map the record id → master-data db id). When
 * false it's a static mock config (e.g. Purchase Orders, until a backend exists).
 */
export interface ResolvedView extends ViewConfig {
  backed: boolean;
  masterSlug?: string;
  /** idKey value (e.g. SKU) → master-data row id, for update/delete. */
  ids?: Record<string, string>;
}

/** module/sub → backend master slug, for views backed by the generic master system. */
export const BACKED_VIEWS: Record<string, { masterSlug: string }> = {
  'inventory/items': { masterSlug: 'item' },
};

/** Does a List/Record view exist for this sub-module (backend-backed or mock)? */
export function hasView(module: string, sub: string): boolean {
  if (sub === 'dashboard') return false;
  return !!BACKED_VIEWS[`${module}/${sub}`] || !!getView(module, sub);
}
