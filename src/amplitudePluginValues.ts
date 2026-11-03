/**
 * What may leave the plugin: copies for the host's callbacks and values for the bridge. No state
 * and nothing about Amplitude.
 */
export type Properties = Record<string, unknown>;
export type FlatValue = string | number | boolean;

const MAX_COPY_DEPTH = 10;
export const MAX_COPIED_VALUES = 1000;
const MAX_USER_PROPERTY_KEY_LENGTH = 32;
const MAX_USER_PROPERTY_TEXT_LENGTH = 255;

export function isPlainObject(value: unknown): value is Properties {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * A copy sharing nothing with the original: Amplitude's core copies events shallowly and hands
 * destinations the same nested objects, so an edit here would reach the other destinations.
 * What cannot be copied safely (class instances, branches past the depth limit or past the budget
 * of {@link MAX_COPIED_VALUES} values) is left out.
 *
 * Anything in [cutAt] is left out wherever it appears, as a cycle is.
 *
 * The ancestors guard stops cycles, not repeated expansion of a shared object: seven levels with
 * six references each would be walked 6^7 times. The budget bounds the total work.
 */
export function clonePlain(value: unknown, cutAt: readonly object[] = []): unknown {
  const budget = {left: MAX_COPIED_VALUES, cut: new Set(cutAt)};
  return copyWithin(value, new Set(), budget);
}

function copyWithin(
  value: unknown,
  ancestors: ReadonlySet<object>,
  budget: {left: number; cut: ReadonlySet<object>},
): unknown {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'function' ? undefined : value;
  }
  if (ancestors.size > MAX_COPY_DEPTH || ancestors.has(value) || budget.cut.has(value) || budget.left <= 0) {
    return undefined;
  }
  budget.left -= 1;
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  const path = new Set([...ancestors, value]);
  if (Array.isArray(value)) {
    return value.map((item) => copyWithin(item, path, budget)).filter((item) => item !== undefined);
  }
  if (!isPlainObject(value)) {
    return undefined;
  }
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, copyWithin(item, path, budget)])
      .filter(([, item]) => item !== undefined),
  );
}

function toFlatValue(value: unknown): FlatValue | undefined {
  if (value instanceof Date) {
    return value.getTime();
  }
  const isFlat = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
  return isFlat ? value : undefined;
}

/**
 * Android's map conversion turns every number into a double, so `[1]` would join as `1.0` there
 * and `1` on iOS. As text it joins the same. What the native policy refuses in an array, a number
 * that is not finite, costs the array here too: as text it would pass.
 */
function toArrayItem(value: unknown): string | boolean | undefined {
  const flat = toFlatValue(value);
  if (typeof flat !== 'number') {
    return flat;
  }
  return Number.isFinite(flat) ? String(flat) : undefined;
}

function toBridgeValue(value: unknown): FlatValue | FlatValue[] | undefined {
  if (!Array.isArray(value)) {
    return toFlatValue(value);
  }
  const items = value.map((item) => toArrayItem(item));
  return items.includes(undefined) ? undefined : (items as FlatValue[]);
}

/**
 * Only what the native policy can use crosses the bridge. It is not a copy: nested values are
 * never read. Converting a JS value to native recurses with no guard, so one circular property
 * would overflow the native stack, and nothing can catch that. Also what detaches a parked event
 * from later edits.
 */
export function toBridgeProperties(properties: unknown): Properties {
  if (!isPlainObject(properties)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(properties)
      .map(([key, value]) => [key, toBridgeValue(value)])
      .filter(([, value]) => value !== undefined),
  );
}

export function isUserPropertyKey(key: string): boolean {
  return key.trim() !== '' && key.length <= MAX_USER_PROPERTY_KEY_LENGTH;
}

/** Too long is refused, not cut: a cut value in targeting is worse than an empty one. */
export function isUserPropertyValue(value: unknown): value is FlatValue {
  if (typeof value === 'string') {
    return value.length <= MAX_USER_PROPERTY_TEXT_LENGTH;
  }
  return typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
}
