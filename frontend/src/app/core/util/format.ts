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

/**
 * Parse a stored date value into a `Date` at LOCAL midnight of its calendar day,
 * so the date picker shows the same day in every timezone. A `date` field is a
 * calendar date, not an instant: parsing a bare `YYYY-MM-DD` (or UTC-midnight)
 * with `new Date(str)` yields UTC midnight, which the picker then renders a day
 * off in a non-UTC zone. Full timestamps (a real time-of-day) keep their instant.
 * Returns null for empty/unparseable input.
 */
export function parseDateValue(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.0+)?Z)?$/.exec(s);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Serialize a date-picker value (a `Date` at local midnight) to a bare calendar
 * date `YYYY-MM-DD`, using LOCAL parts — never `.toISOString()`, which shifts the
 * day across the timezone (in IST, local midnight becomes the previous day 18:30Z).
 */
export function toCalendarDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
