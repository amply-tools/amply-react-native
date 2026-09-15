import AsyncStorage from '@react-native-async-storage/async-storage';
import {ValueFormat, eventSignature, type JsonMap} from './format';

/**
 * One entry in the Recent strip: the exact `{name, properties}` pair that was tracked, so
 * tapping the chip re-fires it byte for byte rather than approximately.
 */
export type RecentEvent = {
  name: string;
  properties: JsonMap;
};

/**
 * Recent-events history — SAMPLE_APP_SPEC.md §6.
 *
 * Max 12, most-recent-first, de-duplicated on `name + serialized properties`, persisted across
 * launches, cleared only by the ✕ on a chip or by `amplySeed`.
 *
 * `AsyncStorage`, deliberately NOT the SDK's own store: the sample's UI state is not SDK state,
 * and putting it there would make the sample's behaviour depend on the internals it exists to
 * test. Already a dependency of both examples — no new one is introduced.
 */
export const RECENT_EVENTS_KEY = 'amply:recentEvents';
export const RECENT_EVENTS_CAPACITY = 12;

export function recentLabel(entry: RecentEvent): string {
  const summary = ValueFormat.summarise(entry.properties, 2);
  return summary.length > 0 ? `${entry.name} · ${summary}` : entry.name;
}

/**
 * Most-recent-first, de-duplicated: re-firing an existing entry moves it to the front instead of
 * adding a thirteenth copy of it.
 */
export function recordRecent(entries: readonly RecentEvent[], event: RecentEvent): RecentEvent[] {
  const signature = eventSignature(event.name, event.properties);
  const kept = entries.filter(item => eventSignature(item.name, item.properties) !== signature);
  return [event, ...kept].slice(0, RECENT_EVENTS_CAPACITY);
}

export async function loadRecents(): Promise<RecentEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_EVENTS_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is RecentEvent => {
        return (
          typeof item === 'object' &&
          item !== null &&
          typeof (item as RecentEvent).name === 'string'
        );
      })
      .map(item => ({name: item.name, properties: item.properties ?? {}}))
      .slice(0, RECENT_EVENTS_CAPACITY);
  } catch (error) {
    // The strip is a convenience; the SDK calls behind it already happened. A corrupt store
    // must not take the screen down with it.
    // eslint-disable-next-line no-console
    console.warn('[amply.sample] failed to read the recent-events store', error);
    return [];
  }
}

export async function persistRecents(entries: readonly RecentEvent[]): Promise<void> {
  try {
    await AsyncStorage.setItem(RECENT_EVENTS_KEY, JSON.stringify(entries));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[amply.sample] failed to persist the recent-events store', error);
  }
}
