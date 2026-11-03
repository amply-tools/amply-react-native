/**
 * Include and exclude lists for the Amplitude plugin: "only these" and "everything but these",
 * for event names and for property keys. Names are matched as Amplitude shows them, before
 * the plugin strips the `[Amplitude] ` prefix or a transform renames anything.
 */
import {isPlainObject} from './amplitudePluginValues';

/** An exact name, or a pattern tested against the name. */
export type NameMatcher = string | RegExp;

/** Absent `include` means everything. `exclude` wins over `include`. */
export type NameLists = {
  include?: readonly NameMatcher[];
  exclude?: readonly NameMatcher[];
};

type Matcher = (name: string) => boolean;

const refuseAll: Matcher = () => false;

/**
 * Prepared once. A pattern is copied with its flags, and its `lastIndex` is reset before every
 * test, so a `g` or `y` flag means what it means for the host and its own RegExp never moves.
 */
function toMatcher(entry: unknown): Matcher {
  if (typeof entry === 'string') {
    return (name) => name === entry;
  }
  if (entry instanceof RegExp) {
    const pattern = new RegExp(entry.source, entry.flags);
    return (name) => {
      pattern.lastIndex = 0;
      return pattern.test(name);
    };
  }
  throw new TypeError('an entry is neither a string nor a RegExp');
}

/** Undefined when the list is absent. A list that is present must be an array. */
function toMatchers(entries: unknown): Matcher[] | undefined {
  if (entries === undefined) {
    return undefined;
  }
  if (!Array.isArray(entries)) {
    throw new TypeError('a list is not an array');
  }
  return entries.map(toMatcher);
}

/**
 * Built once per plugin: the answer for a name never changes while the plugin lives. Lists it
 * cannot read refuse every name, the same as a `filter` that throws: an exclude that silently
 * stopped excluding would send what the host meant to keep out.
 */
export function createNameTest(lists: unknown, onInvalid: () => void): Matcher {
  try {
    if (lists === undefined) {
      return () => true;
    }
    if (!isPlainObject(lists)) {
      throw new TypeError('lists are not an object');
    }
    const include = toMatchers(lists.include);
    const exclude = toMatchers(lists.exclude) ?? [];
    return (name) => {
      if (include && !include.some((matches) => matches(name))) {
        return false;
      }
      return !exclude.some((matches) => matches(name));
    };
  } catch {
    onInvalid();
    return refuseAll;
  }
}

/** The same record without the keys [isAllowed] turns down. A dropped key's value is never read. */
export function pickKeys(
  record: Record<string, unknown>,
  isAllowed: (key: string) => boolean,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(record)
      .filter(isAllowed)
      .map((key) => [key, record[key]]),
  );
}
