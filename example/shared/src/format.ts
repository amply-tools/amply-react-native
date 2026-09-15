/**
 * Rendering helpers shared by every payload / snapshot / trace / recent chip.
 *
 * The one that matters is {@link typeName}: a property's TYPE is what targeting compares on, and
 * `level = "7"` never matching `level > 5` is the single most common way a campaign silently
 * does not fire. It is invisible without a type column.
 */

export type JsonMap = Record<string, unknown>;

export const ValueFormat = {
  typeName(value: unknown): string {
    if (value === null) {
      return 'null';
    }
    if (Array.isArray(value)) {
      return 'array';
    }
    switch (typeof value) {
      case 'boolean':
        return 'boolean';
      case 'number':
        return 'number';
      case 'string':
        return 'string';
      case 'object':
        return 'object';
      default:
        return typeof value;
    }
  },

  describe(value: unknown): string {
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (Array.isArray(value)) {
      return `[${value.length} item${value.length === 1 ? '' : 's'}]`;
    }
    if (typeof value === 'object') {
      const count = Object.keys(value as JsonMap).length;
      return `{${count} key${count === 1 ? '' : 's'}}`;
    }
    return String(value);
  },

  /** `k=v, k=v`, keys sorted so two runs of the same state read the same. */
  summarise(map: JsonMap | null | undefined, max = 4): string {
    if (!map) {
      return '';
    }
    const keys = Object.keys(map).sort();
    if (keys.length === 0) {
      return '';
    }
    const shown = keys
      .slice(0, max)
      .map(key => `${key}=${ValueFormat.describe(map[key])}`)
      .join(', ');
    return keys.length > max ? `${shown}, +${keys.length - max} more` : shown;
  },

  /** Clamps a detail line to the one-line budget SAMPLE_APP_SPEC.md §5 sets for it. */
  oneLine(text: string, limit = 78): string {
    const flat = text.replace(/\n/g, ' ');
    return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
  },
};

/** `HH:mm:ss.SSS`, local — the timestamp column of every log row. */
export function formatLogTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return (
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.` +
    pad(date.getMilliseconds(), 3)
  );
}

/**
 * The window in which a number is plausibly epoch milliseconds: 2001-09-09 to 2100-01-01.
 *
 * Bounded deliberately at both ends. A hint on every `number` row is a hint nobody reads, and it
 * then fails on the row that actually matters — an amber warning next to `level = 7` teaches a
 * reader to ignore the colour. Below the lower bound sit every counter, level, price and score;
 * above the upper bound nothing a person sets is a date.
 */
const EPOCH_MILLIS_RANGE = {min: 1_000_000_000_000, max: 4_102_444_800_000} as const;

/**
 * Whether a number could be a datetime the wire cannot distinguish from a plain number.
 *
 * This is permanent, not a bug awaiting a fix: a custom property's value travels as a bare JSON
 * scalar and the SDK stores a datetime as epoch milliseconds, so backend type inference reports
 * such a property as `number` — and a test pins that behaviour. The campaign editor compensates
 * with a manual value-type selector beside the key.
 *
 * It does NOT invent a `datetime` type: the SDK genuinely does not know which this is.
 */
export function couldBeEpochMillis(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= EPOCH_MILLIS_RANGE.min &&
    value <= EPOCH_MILLIS_RANGE.max
  );
}

/**
 * The de-duplication key for the Recent strip. Serialising the properties rather than comparing
 * objects is what makes `Purchase {product: pro}` and `Purchase {product: starter}` two entries,
 * and two taps of the same chip one.
 */
export function eventSignature(name: string, properties: JsonMap): string {
  const keys = Object.keys(properties).sort();
  const body = keys.map(key => `${key}=${ValueFormat.describe(properties[key])}`).join(',');
  return `${name}|${body}`;
}
