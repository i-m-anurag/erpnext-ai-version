/** Dedicated table name for a document entity (e.g. "purchase-order" → doc_purchase_order). */
export function tableNameForSlug(slug: string): string {
  return `doc_${slug.replace(/-/g, '_')}`;
}
