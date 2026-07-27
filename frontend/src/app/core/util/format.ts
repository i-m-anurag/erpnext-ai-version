/**
 * Shared display formatters used across every table and report, so dates and
 * status/state badges look identical everywhere.
 */

/**
 * A date/time as DD-MM-YYYY HH:MM:SS. Blank for empty; echoes back unparseable input.
 * Formatted in UTC on purpose: the app stores posting dates as UTC midnight, so local
 * formatting would drag them across a timezone (e.g. IST → 05:30:00). UTC keeps a
 * date-only value reading as 00:00:00.
 */
export function formatDateTime(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** Tone for a lifecycle status (the master-row `status`: draft / active / archived). */
export function lifecycleTone(status: unknown): string {
  const s = String(status ?? '').toLowerCase();
  if (s === 'draft') return 'default';
  if (s === 'archived' || s === 'cancelled') return 'danger';
  return 'success';
}

/** Tone for a business state (the controller-derived `state`: Issued, Pending, …). */
export function stateTone(state: unknown): string {
  const s = String(state ?? '').toLowerCase();
  if (['issued', 'transferred', 'received', 'ordered', 'approved', 'completed', 'posted', 'paid'].includes(s)) return 'success';
  if (['pending', 'partially ordered', 'submitted', 'draft', 'stopped'].includes(s)) return 'warn';
  if (['cancelled', 'rejected'].includes(s)) return 'danger';
  return 'info';
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** Pill markup for an ag-grid cell renderer — same badge as the record header. */
export function badgeHtml(label: unknown, tone: string): string {
  const text = String(label ?? '').trim();
  if (!text) return '';
  const pretty = text.charAt(0).toUpperCase() + text.slice(1);
  return `<span class="iq-badge iq-badge--${tone}">${escapeHtml(pretty)}</span>`;
}
