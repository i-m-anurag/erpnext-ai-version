/**
 * Deep merge for config resources (override wins, field-by-field) with
 * per-resource-type array semantics.
 *
 * Plain objects merge recursively. Arrays REPLACE by default, EXCEPT arrays
 * whose property name appears in `arrayMergeKeys`, which merge element-by-element
 * by an identity field (e.g. form `fields` merge by `key`, not by index — §3.4).
 * Elements present only in the override are appended; `null` in the override
 * deletes the inherited value.
 */
export type ArrayMergeKeys = Record<string, string>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function mergeArrayByKey(
  baseArr: unknown[],
  overrideArr: unknown[],
  idField: string,
  arrayMergeKeys: ArrayMergeKeys,
): unknown[] {
  const result: unknown[] = [];
  const overrideById = new Map<unknown, Record<string, unknown>>();
  const overrideOrder: unknown[] = [];

  for (const item of overrideArr) {
    if (isPlainObject(item) && idField in item) {
      overrideById.set(item[idField], item);
      overrideOrder.push(item[idField]);
    } else {
      // override element without an id — keep as-is (appended below)
      overrideOrder.push(Symbol('anon'));
      result.push(item);
    }
  }

  const consumed = new Set<unknown>();
  // Keep base order; merge matching override elements onto base elements.
  for (const baseItem of baseArr) {
    if (isPlainObject(baseItem) && idField in baseItem) {
      const id = baseItem[idField];
      const ov = overrideById.get(id);
      if (ov !== undefined) {
        consumed.add(id);
        if (ov.__deleted === true) continue; // override can tombstone a base element
        result.push(deepMerge(baseItem, ov, arrayMergeKeys));
      } else {
        result.push(baseItem);
      }
    } else {
      result.push(baseItem);
    }
  }
  // Append override-only elements (new fields) in override order.
  for (const id of overrideOrder) {
    if (typeof id === 'symbol') continue;
    if (!consumed.has(id)) {
      const ov = overrideById.get(id);
      if (ov && ov.__deleted !== true) result.push(ov);
    }
  }
  return result;
}

export function deepMerge<T>(base: T, override: unknown, arrayMergeKeys: ArrayMergeKeys = {}): T {
  if (override === undefined) return base;
  if (override === null) return null as T;

  if (isPlainObject(base) && isPlainObject(override)) {
    const out: Record<string, unknown> = { ...base };
    for (const [k, ov] of Object.entries(override)) {
      const bv = out[k];
      if (ov === null) {
        delete out[k];
      } else if (Array.isArray(bv) && Array.isArray(ov) && k in arrayMergeKeys) {
        out[k] = mergeArrayByKey(bv, ov, arrayMergeKeys[k]!, arrayMergeKeys);
      } else if (isPlainObject(bv) && isPlainObject(ov)) {
        out[k] = deepMerge(bv, ov, arrayMergeKeys);
      } else {
        out[k] = ov;
      }
    }
    return out as T;
  }

  // Scalar / array (non-merge-key) / type-mismatch → override wins.
  return override as T;
}
