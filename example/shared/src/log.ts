import {Theme} from './theme';
import {couldBeEpochMillis, type JsonMap} from './format';

/**
 * What produced a row. Every case maps to something the SDK actually emits — see
 * SAMPLE_APP_SPEC.md §5. Nothing here is invented, and nothing the SDK emits is dropped.
 */
export type LogKind =
  | 'sdk' // SdkInitialized, ConfigFetchStarted, ConfigFetchFinished
  | 'session' // SessionStarted, SessionFinished
  | 'event' // custom events, and EventTriggered
  | 'campaign' // CampaignShown, CampaignResolved
  | 'gate' // app-side presenter lines: register / present / report / withdraw
  | 'deeplink' // the deep link listener
  | 'property'; // CustomPropertyChanged

export type LogSeverity = 'info' | 'warn' | 'error';

export const kindColour: Record<LogKind, string> = {
  sdk: Theme.grey,
  session: Theme.slate,
  event: Theme.blue,
  campaign: Theme.green,
  gate: Theme.purple,
  deeplink: Theme.teal,
  property: Theme.orange,
};

/**
 * Maps an SDK system-event name onto a kind. Unrecognised names fall back to `sdk` rather than
 * being hidden: a system event this sample has not heard of is exactly the thing a regression
 * would produce.
 */
export function kindForSystemEvent(name: string): LogKind {
  switch (name) {
    case 'SessionStarted':
    case 'SessionFinished':
      return 'session';
    case 'CampaignShown':
    case 'CampaignResolved':
      return 'campaign';
    case 'EventTriggered':
      return 'event';
    case 'CustomPropertyChanged':
      return 'property';
    default:
      return 'sdk';
  }
}

/**
 * One `key → value` pair, in the order the row wants them read.
 *
 * A named pair rather than a tuple because `pair[0]` at every use site is precisely how a renderer
 * starts confusing a key with a value again.
 */
export type LogParam = {
  key: string;
  value: unknown;
};

/** One row. Identical model on all three platforms (SAMPLE_APP_SPEC.md §5). */
export type LogRow = {
  id: number;
  timestamp: number;
  kind: LogKind;
  name: string;
  /**
   * ORDERED pairs, rendered **as pairs** — never pre-joined into a string.
   *
   * The first version of this log typed this `detail: string` and called it a "one-line summary".
   * A flattened row cannot tell a key from a value, cannot right-size a long value, and cannot
   * format a value by its type, so it produced `properties={1 key}`, a raw epoch in a row that
   * already showed its own time, and `[0 items]`. Same rule the parameter builder enforces on the
   * way in (§2), for the same reason.
   */
  params: LogParam[];
  /** The full object, shown on expand. `null` = nothing more than the params. */
  payload: JsonMap | null;
  severity: LogSeverity;
  /** The name of the row this one acknowledges (§5.3). `null` for an ordinary row. */
  acknowledges: string | null;
};

/**
 * The filter above the list. `all` is the default and the selection is deliberately not persisted
 * — a filter surviving a relaunch hides rows and reads as a bug.
 */
export type LogFilter = 'all' | LogKind | 'error';

export const LOG_FILTERS: readonly LogFilter[] = [
  'all',
  'event',
  'campaign',
  'gate',
  'deeplink',
  'property',
  'sdk',
  'session',
  'error',
];

export function filterColour(filter: LogFilter): string {
  if (filter === 'all') {
    return Theme.accent;
  }
  if (filter === 'error') {
    return Theme.red;
  }
  return kindColour[filter];
}

export function filterMatches(filter: LogFilter, row: LogRow): boolean {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'error') {
    return row.severity === 'error';
  }
  return row.kind === filter;
}

/** Severity wins the chip colour; kind otherwise. */
export function rowColour(row: LogRow): string {
  if (row.severity === 'error') {
    return Theme.red;
  }
  if (row.severity === 'warn') {
    return Theme.orange;
  }
  return kindColour[row.kind];
}

/**
 * Below this gap a `timestamp` param renders nothing; at or above it the row shows the delta.
 *
 * The first version of this rule was "within 50 ms", and that number sat exactly on Android's
 * dispatch latency: the same four `CustomPropertyChanged` rows dropped the param on one run and
 * printed `timestamp 17:36:40.538` four times on the next, 126 ms out. A log that renders
 * differently run to run is worse than one that renders too much — jitter becomes
 * indistinguishable from a real change. Widening the window would only move the coin-flip, so the
 * rule is semantic instead: the gap between the SDK's stamp and the sample's row is dispatch
 * latency, which is not news. A genuinely old event arriving late would be.
 */
const STAMP_DELTA_FLOOR_MS = 1_000;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** `HH:mm:ss.SSS`, local — the row's own timestamp and any epoch value stamped today. */
export function formatLogTime(timestamp: number): string {
  const date = new Date(timestamp);
  return (
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.` +
    pad(date.getMilliseconds(), 3)
  );
}

/** `1 Oct 2026 02:00` — an epoch value from any day but today. */
function formatLogDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return (
    `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

function isToday(timestamp: number): boolean {
  const then = new Date(timestamp);
  const now = new Date();
  return (
    then.getFullYear() === now.getFullYear() &&
    then.getMonth() === now.getMonth() &&
    then.getDate() === now.getDate()
  );
}

/**
 * How a value reads on a log row — SAMPLE_APP_SPEC.md §5.2.
 *
 * The point of this screen is that a person can read it, so the renderer formats by type rather
 * than printing whatever `String(value)` returns.
 */
export const LogValue = {
  /** Anything the row shortened, and therefore has more of behind the caret. */
  isAbbreviated(value: unknown): boolean {
    if (couldBeEpochMillis(value)) {
      return true;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === 'object' && value !== null) {
      return Object.keys(value as JsonMap).length > 0;
    }
    return false;
  },

  render(value: unknown): string {
    // A number inside the plausible-epoch window reads as a time. Second customer of the predicate
    // the properties list uses (§3.1) — the raw millis stay available on expand.
    if (couldBeEpochMillis(value)) {
      const millis = value as number;
      // Time alone for today — a log row's own timestamps are all today, and the date would be
      // noise. Anything else keeps its day: `trial_ends_at` rendered as `02:00:00.000` is a month
      // away and reads as this morning, which is worse than the raw number.
      return isToday(millis) ? formatLogTime(millis) : formatLogDateTime(millis);
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (typeof value === 'string') {
      return value;
    }
    if (value === null || value === undefined) {
      return 'null';
    }
    if (Array.isArray(value)) {
      return `${value.length} item${value.length === 1 ? '' : 's'}`;
    }
    if (typeof value === 'object') {
      const count = Object.keys(value as JsonMap).length;
      return `${count} key${count === 1 ? '' : 's'}`;
    }
    return String(value);
  },

  /**
   * A pair worth showing at all. Empty collections are dropped rather than rendered as a count of
   * nothing: `[0 items]` announced that something existed and then refused to say what.
   */
  isWorthShowing(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === 'string') {
      return value.length > 0;
    }
    if (typeof value === 'object') {
      return Object.keys(value as JsonMap).length > 0;
    }
    return true;
  },

  /**
   * `CustomPropertyChanged` carries `oldValue` and `newValue` as separate keys, and an OVERWRITE
   * sends both. Two pairs saying half the story each is worse than one saying all of it, so
   * both-present collapses to a single `value  old → new`.
   *
   * One key alone is a different fact and keeps the SDK's own name: `newValue` alone is a property
   * being set, `oldValue` alone is one being removed — which is what a clear emits. (The seed's
   * two rows for the same key are exactly that: a clear, then a set.)
   */
  collapseOldNew(params: readonly LogParam[]): LogParam[] {
    const old = params.find(param => param.key === 'oldValue');
    const next = params.find(param => param.key === 'newValue');
    if (!old || !next) {
      return [...params];
    }
    const kept = params.filter(param => param.key !== 'oldValue' && param.key !== 'newValue');
    return [
      ...kept,
      {key: 'value', value: `${LogValue.render(old.value)} → ${LogValue.render(next.value)}`},
    ];
  },

  /**
   * Turns an SDK payload into the pairs a row should show, applying §5.2's drop rules. Keys sort,
   * so two runs of the same state read the same.
   */
  paramsFrom(
    map: JsonMap,
    rowTimestamp: number,
    drop: readonly string[] = [],
  ): LogParam[] {
    const params: LogParam[] = [];
    for (const key of Object.keys(map).sort()) {
      if (drop.includes(key)) {
        continue;
      }
      const value = map[key];
      if (!LogValue.isWorthShowing(value)) {
        continue;
      }
      if (key === 'timestamp' && typeof value === 'number') {
        // Signed, not absolute: only a stamp genuinely OLDER than the row is news. One from the
        // future is clock skew, and it says nothing worth a line.
        const earlierMs = rowTimestamp - value;
        if (earlierMs < STAMP_DELTA_FLOOR_MS) {
          continue;
        }
        // The absolute time is never restated — the offset is the information. `toFixed` is
        // locale-independent, because this string has to match iOS and Android character for
        // character (`stamped 4.2s earlier`).
        params.push({key: 'stamped', value: `${(earlierMs / 1000).toFixed(1)}s earlier`});
        continue;
      }
      params.push({key, value});
    }
    return params;
  },
};

/**
 * The caret appears only when there is genuinely more to show. A row whose params already say
 * everything does not pretend to expand.
 */
export function isExpandable(row: LogRow): boolean {
  if (!row.payload || Object.keys(row.payload).length === 0) {
    return false;
  }
  const shown = new Set(row.params.map(param => param.key));
  if (Object.keys(row.payload).some(key => !shown.has(key))) {
    return true;
  }
  // A value the row abbreviated — a collection rendered as a count, or an epoch rendered as a
  // time — still has something behind it.
  return row.params.some(param => LogValue.isAbbreviated(param.value));
}

export type LogAppend = {
  kind: LogKind;
  name: string;
  params?: readonly LogParam[];
  /**
   * The common case: a row whose whole content is a sentence. It becomes a single pair with an
   * empty key, which renders the value alone, in ink — a sentence is not a key/value pair and must
   * not be dressed as one.
   */
  note?: string;
  payload?: JsonMap | null;
  severity?: LogSeverity;
  acknowledges?: string | null;
};

/**
 * Deliberately larger than the window either screen shows, so a filter still has something to find
 * after a noisy launch.
 */
export const LOG_CAPACITY = 400;

let nextLogId = 0;

/**
 * Builds a row and returns the new, bounded list — newest first. A pure function rather than a
 * store object because the provider owns the state and React owns the fan-out; a second source of
 * truth here is how the two RN examples drifted in the first place.
 */
export function appendRow(rows: readonly LogRow[], entry: LogAppend): LogRow[] {
  const params = entry.note !== undefined ? [{key: '', value: entry.note}] : [...(entry.params ?? [])];
  const row: LogRow = {
    id: ++nextLogId,
    timestamp: Date.now(),
    kind: entry.kind,
    name: entry.name,
    params,
    payload: entry.payload && Object.keys(entry.payload).length > 0 ? entry.payload : null,
    severity: entry.severity ?? 'info',
    acknowledges: entry.acknowledges ?? null,
  };
  // Also to stdout, so a scripted run can be read from the device log without a screenshot.
  const flat = params.map(param => `${param.key}=${LogValue.render(param.value)}`).join(' ');
  // eslint-disable-next-line no-console
  console.log(`[amply.sample] ${formatLogTime(row.timestamp)} ${row.kind} ${row.name} ${flat}`);
  const next = [row, ...rows];
  return next.length > LOG_CAPACITY ? next.slice(0, LOG_CAPACITY) : next;
}

/**
 * Whether the row this acknowledgement points at is drawn immediately beside it (§5.3).
 *
 * Rows are newest-first and the SDK emits the acknowledgement AFTER the call it acknowledges, so
 * the cause is the next OLDER row. A gated call logs as `trackGated` and carries its event name in
 * a param, so match on either.
 */
export function causeIsAdjacent(rows: readonly LogRow[], index: number): boolean {
  const row = rows[index];
  if (!row.acknowledges || index + 1 >= rows.length) {
    return false;
  }
  const previous = rows[index + 1];
  if (previous.name === row.acknowledges) {
    return true;
  }
  return previous.params.some(param => param.key === 'event' && param.value === row.acknowledges);
}
