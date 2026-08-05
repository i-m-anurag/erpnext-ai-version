import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, type Observable } from 'rxjs';

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
  template: { title: string; disabled: boolean; taxes: TemplateTaxRow[] } | null;
}

/**
 * Project-wide utility for resolving an item's tax templates. `forItem(code)`
 * fetches the item with its Item Tax Templates expanded (opt-in ?expand on the
 * master API) and returns EVERY assignment; use {@link pickApplicableTemplate}
 * to choose the one that applies to a transaction line.
 */
@Injectable({ providedIn: 'root' })
export class ItemTaxService {
  private readonly http = inject(HttpClient);

  /** All of an item's tax assignments, each expanded with its template rows. */
  forItem(itemCode: string): Observable<ResolvedItemTax[]> {
    const params = new HttpParams().set('expand', 'taxTemplates');
    return this.http
      .get<{ row: { taxTemplates?: ResolvedItemTax[] } }>(
        `/api/masters/item/record/${encodeURIComponent(itemCode)}`,
        { params },
      )
      .pipe(map((r) => r.row?.taxTemplates ?? []));
  }
}

/**
 * Pure selection (mirror of the backend): from an item's resolved tax
 * assignments, pick the one that applies to a line given the posting date and
 * the line's net rate (unit rate before tax). Skips disabled/missing templates,
 * honours validFrom (<= date) and the [minNetRate, maxNetRate] band (blank =
 * unbounded); latest validFrom wins. Returns null when nothing matches.
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
  return [...eligible].sort((a, b) => (b.validFrom ?? '').localeCompare(a.validFrom ?? ''))[0]!;
}
