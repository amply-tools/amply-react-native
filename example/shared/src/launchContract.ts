/**
 * The launch contract — SAMPLE_APP_SPEC.md §7.
 *
 * Two instructions, both **inert when absent**: `amplySnapshot=<screen-id>` navigates straight to
 * a named screen, `amplySeed=1` replaces sample state with a fixed script of real SDK calls. The
 * readiness marker `amply.snapshot.ready` goes up once the target screen has settled, so a
 * harness can poll instead of sleeping and hoping.
 *
 * Driving screenshots with synthetic taps is the flakiest part of the exercise — injected taps
 * get swallowed and UI-automation tooling is not reliably available. Taking the instruction at
 * launch removes the tap entirely.
 *
 * **On React Native the transport is a deeplink query param, not a launch argument.** Neither
 * example can read process launch arguments without a new native dependency (or, on Expo, a
 * config plugin that `prebuild` would regenerate away), and both already handle deeplinks — so
 * the transport doubles as evidence that the link path works. The key spellings are identical to
 * the native samples, which is why one manifest row covers all three platforms.
 *
 *   xcrun simctl openurl booted "amplybare://snapshot?amplySnapshot=inspect.properties&amplySeed=1"
 *   adb shell am start -a android.intent.action.VIEW \
 *     -d "amplybare://snapshot?amplySnapshot=inspect.properties&amplySeed=1"
 */

export const SNAPSHOT_KEY = 'amplySnapshot';
export const SEED_KEY = 'amplySeed';
export const READY_MARKER = 'amply.snapshot.ready';

/** The five tabs the sample's shell is made of. Tab order carries the section ordering. */
export type TabId = 'sdk' | 'events' | 'campaigns' | 'inspect' | 'log';

export const TABS: readonly {id: TabId; title: string}[] = [
  {id: 'sdk', title: 'SDK'},
  {id: 'events', title: 'Events'},
  {id: 'campaigns', title: 'Campaigns'},
  {id: 'inspect', title: 'Inspect'},
  {id: 'log', title: 'Log'},
];

/**
 * What a snapshot screen id resolves to: the tab to show, and the one detail that tab has to
 * apply before it counts as rendered.
 */
export type SnapshotTarget = {
  tab: TabId;
  /** Selects `@custom` in the dataset picker. */
  dataset?: 'custom';
  /** Scrolls the custom-properties block to the top of the Inspect tab. */
  scrollTo?: 'properties';
  /** Selects a log filter chip. `all` is the default and is still stated, not assumed. */
  filter?: 'all' | 'event';
  /** Delivers the deeplink fixture so §4's panel is populated. */
  deeplinkFixture?: true;
};

export const SNAPSHOT_TARGETS = {
  sdk: {tab: 'sdk'},
  events: {tab: 'events'},
  campaigns: {tab: 'campaigns', deeplinkFixture: true},
  'inspect.datasets.custom': {tab: 'inspect', dataset: 'custom'},
  'inspect.properties': {tab: 'inspect', scrollTo: 'properties'},
  log: {tab: 'log', filter: 'all'},
  'log.filtered.event': {tab: 'log', filter: 'event'},
} as const satisfies Record<string, SnapshotTarget>;

export type SnapshotScreen = keyof typeof SNAPSHOT_TARGETS;

export const SNAPSHOT_SCREENS = Object.keys(SNAPSHOT_TARGETS) as SnapshotScreen[];

export type SnapshotRequest = {
  screen: SnapshotScreen;
  seed: boolean;
};

export function targetFor(screen: SnapshotScreen): SnapshotTarget {
  return SNAPSHOT_TARGETS[screen];
}

/**
 * Reads the query string of an arriving URL. Deliberately hand-rolled rather than `new URL(…)`:
 * Hermes' URL implementation rejects custom schemes on some RN versions, and a snapshot harness
 * failing on the parse of its own instruction is a bad trade for four lines.
 */
export function parseQuery(url: string): Record<string, string> {
  const start = url.indexOf('?');
  if (start < 0) {
    return {};
  }
  const query = url.slice(start + 1).split('#')[0];
  const params: Record<string, string> = {};
  for (const pair of query.split('&')) {
    if (pair.length === 0) {
      continue;
    }
    const separator = pair.indexOf('=');
    const key = separator < 0 ? pair : pair.slice(0, separator);
    const value = separator < 0 ? '' : pair.slice(separator + 1);
    try {
      params[decodeURIComponent(key)] = decodeURIComponent(value);
    } catch {
      params[key] = value;
    }
  }
  return params;
}

/**
 * `null` for every URL that does not carry the instruction — which is the inertness guarantee the
 * spec requires, expressed as the function's first branch.
 */
export function readSnapshotRequest(url: string | null | undefined): SnapshotRequest | null {
  if (!url) {
    return null;
  }
  const params = parseQuery(url);
  const raw = params[SNAPSHOT_KEY];
  if (!raw) {
    return null;
  }
  const screen = SNAPSHOT_SCREENS.find(candidate => candidate === raw);
  if (!screen) {
    // eslint-disable-next-line no-console
    console.warn(
      `amply.snapshot: unknown screen id '${raw}' — expected one of ${SNAPSHOT_SCREENS.join(', ')}`,
    );
    return null;
  }
  const seedRaw = (params[SEED_KEY] ?? '').toLowerCase();
  return {screen, seed: seedRaw === '1' || seedRaw === 'true' || seedRaw === 'yes'};
}

/**
 * The SDK status has to be terminal before the marker goes up, but a harness must never hang on a
 * device with no network. Past this the marker goes up anyway and the log says the status it went
 * up at, so the screenshot is still interpretable.
 */
export const READINESS_DEADLINE_MS = 12_000;

/** How long the seed waits for `ready` before tracking into a session that may still be starting. */
export const SEED_READY_DEADLINE_MS = 8_000;
