import { masterService } from './master.service.js';

/** One tax component of an Item Tax Template. */
export interface TemplateTaxRow {
  taxAccount: string;
  taxRate: number | null;
  notApplicable: boolean;
}

/** An item's tax assignment, expanded with the referenced template's body. */
export interface ResolvedItemTax {
  itemTaxTemplate: string;
  validFrom: string | null;
  minNetRate: number | null;
  maxNetRate: number | null;
  /** The referenced template, or null if it was deleted/missing. */
  template: { title: string; disabled: boolean; taxes: TemplateTaxRow[] } | null;
}

interface RawAssignment {
  itemTaxTemplate?: unknown;
  validFrom?: unknown;
  minNetRate?: unknown;
  maxNetRate?: unknown;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/**
 * Resolves an Item's tax assignments (item.data.itemTaxes) into fully-expanded
 * templates — the single source of truth for "given an item, what tax templates
 * apply". Returns EVERY assignment expanded; use {@link pickApplicableTemplate}
 * with a transaction date + net rate to choose the one that applies to a line.
 */
export class ItemTaxService {
  /** Expand an item's tax assignments with each referenced template's rows. */
  async resolveForItem(itemCode: string): Promise<ResolvedItemTax[]> {
    const item = await masterService.getRecord('item', itemCode).catch(() => null);
    const assignments = Array.isArray(item?.data?.['itemTaxes']) ? (item!.data['itemTaxes'] as RawAssignment[]) : [];
    if (!assignments.length) return [];

    // Fetch each distinct template once.
    const cache = new Map<string, ResolvedItemTax['template']>();
    const load = async (title: string): Promise<ResolvedItemTax['template']> => {
      if (cache.has(title)) return cache.get(title)!;
      const tpl = await masterService.getRecord('item-tax-template', title).catch(() => null);
      const resolved = tpl
        ? {
            title: String(tpl.data['title'] ?? tpl.code),
            disabled: tpl.data['disabled'] === true,
            taxes: (Array.isArray(tpl.data['taxes']) ? (tpl.data['taxes'] as Record<string, unknown>[]) : []).map((t) => ({
              taxAccount: String(t['taxAccount'] ?? ''),
              taxRate: num(t['taxRate']),
              notApplicable: t['notApplicable'] === true,
            })),
          }
        : null;
      cache.set(title, resolved);
      return resolved;
    };

    const out: ResolvedItemTax[] = [];
    for (const a of assignments) {
      const title = str(a.itemTaxTemplate);
      if (!title) continue;
      out.push({
        itemTaxTemplate: title,
        validFrom: str(a.validFrom),
        minNetRate: num(a.minNetRate),
        maxNetRate: num(a.maxNetRate),
        template: await load(title),
      });
    }
    return out;
  }
}

export const itemTaxService = new ItemTaxService();

/**
 * Pure selection: from an item's resolved tax assignments, pick the one that
 * applies to a transaction line, given the posting date and the line's net rate
 * (unit rate before tax). Precedence:
 *   - skip disabled / missing templates,
 *   - honour validFrom (<= date) and the [minNetRate, maxNetRate] band (blank = unbounded),
 *   - among eligible rows, the latest validFrom wins (blank validFrom sorts first).
 * Returns null when nothing matches. Date/netRate are optional — an omitted
 * constraint is simply not applied.
 */
export function pickApplicableTemplate(
  resolved: ResolvedItemTax[],
  ctx: { date?: string; netRate?: number } = {},
): ResolvedItemTax | null {
  const { date, netRate } = ctx;
  const eligible = resolved.filter((r) => {
    if (!r.template || r.template.disabled) return false;
    if (date && r.validFrom && r.validFrom > date) return false;
    if (netRate !== undefined && netRate !== null) {
      if (r.minNetRate !== null && netRate < r.minNetRate) return false;
      if (r.maxNetRate !== null && netRate > r.maxNetRate) return false;
    }
    return true;
  });
  if (!eligible.length) return null;
  eligible.sort((a, b) => (b.validFrom ?? '').localeCompare(a.validFrom ?? ''));
  return eligible[0]!;
}
