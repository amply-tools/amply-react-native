import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {Linking, LogBox} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Amply from '@amplytools/react-native-amply-sdk';
import type {EventRecord} from '@amplytools/react-native-amply-sdk';

import sdkPackage from '../../../package.json';
import {
  EMPTY_CREDENTIALS,
  REFUSAL_HEADLINE,
  REFUSAL_REASON,
  credentialSource,
  hasStoredCredentials,
  isUsable,
  maskCredential,
  withStoredCredentials,
  type CredentialSource,
  type StoredCredentials,
} from './sampleConfig';
import {
  CREDENTIAL_FIELDS,
  clearCredentials,
  loadCredentials,
  saveCredentials,
  type CredentialField,
} from './sampleCredentials';
import {ValueFormat, type JsonMap} from './format';
import {
  LogValue,
  appendRow,
  kindForSystemEvent,
  type LogAppend,
  type LogRow,
} from './log';
import {
  loadRecents,
  persistRecents,
  recordRecent,
  type RecentEvent,
} from './recentEvents';
import {dataSetTypeFor, type DataSetOptionId} from './datasets';
import type {CampaignRef} from './gateDemo';
import {
  READINESS_DEADLINE_MS,
  SEED_READY_DEADLINE_MS,
  readSnapshotRequest,
  targetFor,
  type SnapshotRequest,
} from './launchContract';
import {useGateController, type GateApi} from './useGateController';

/** The four values that genuinely differ between the two React Native examples. */
export type SampleTargetConfig = {
  /** Supply your own Amply keys before running the sample — real credentials are never committed. */
  appId: string;
  apiKeyPublic: string;
  apiKeySecret: string;
  /**
   * Which distribution channel this build guards — "bare" or "expo". It is on screen because a
   * screenshot of the wrong sample is otherwise indistinguishable from the right one, and these
   * two exist precisely to be compared.
   */
  channel: string;
  /** The app's own deeplink scheme, shown in the docs line of the log section. */
  scheme: string;
  /**
   * Both optional and both **unset by default**, which means the SDK falls back to its built-in
   * PRODUCTION endpoints. Say so on screen rather than leaving it to be discovered: a campaign
   * authored in one environment is invisible in the other, and the SDK cannot tell that from "no
   * campaign matched".
   */
  configBaseUrl?: string | null;
  backendBaseUrl?: string | null;
};

/** The SDK status the §1 chip renders. Four states, never a free-text sentence. */
export type SdkStatus = 'ready' | 'initializing' | 'not-initialized' | 'failed';

export type DeepLinkRecord = {
  url: string;
  info: JsonMap;
};

/**
 * The SDK's own logger reaches React Native through `console` and nothing else — there is no
 * `setLogListener` bridge (SDK-GAP-3), and the public `addSystemEventListener` filters `DebugLog`
 * out. So every SDK warning becomes a LogBox notification, and with the placeholder credentials
 * this sample ships with, the backend answers 403/404 on every batch — a permanent banner across
 * the tab bar, in every screenshot, saying something the app's own §5 log already reports through
 * `ConfigFetchFinished`.
 *
 * Only the SDK's own logger lines are quieted, and only in the notification: they still go to the
 * device log and the debugger, and every React warning still raises the banner. Suppressing more
 * than this would be hiding defects.
 */
if (__DEV__) {
  LogBox.ignoreLogs([/^\[\d{4}-\d{2}-\d{2}T.*\]\[Amply\./]);
}

/** Three days back — recent enough to read as real, old enough to look deliberate. */
const SEED_LAST_SEEN_AGO_MS = 3 * 24 * 60 * 60 * 1000;

const AUTO_INIT_KEY = 'amply:autoInitialize';
const INITIALIZATION_DEADLINE_MS = 10_000;

export type SampleContextValue = {
  /** The committed file, as the example declares it. */
  config: SampleTargetConfig;
  /** The file with anything entered in the app laid over it — what the SDK is actually given. */
  resolved: SampleTargetConfig;
  /** Whether the resolved credentials can start the SDK at all (SAMPLE_APP_SPEC.md §5.5). */
  isConfigurationUsable: boolean;
  /** Which of the two doors the resolved credentials came through. */
  credentialSource: CredentialSource;
  storedCredentials: StoredCredentials;
  hasStoredCredentials: boolean;
  storeCredentials: (values: Record<CredentialField, string>) => Promise<void>;
  forgetCredentials: () => Promise<void>;
  status: SdkStatus;
  /**
   * There is no bridge method for `AmplySDKInterface.VERSION` (SDK-GAP-3), so RN renders the npm
   * package version and labels it `js` rather than printing a number it cannot read.
   */
  sdkVersion: string;
  /** `getSessionManager()` is on neither platform facade (SDK-GAP-2). Say so; do not invent a call. */
  sessionText: string;
  userId: string;
  logLevel: string;
  autoInitialize: boolean;

  logs: readonly LogRow[];
  recents: readonly RecentEvent[];
  campaigns: readonly CampaignRef[];
  lastDeepLink: DeepLinkRecord | null;
  lastMatchedEvent: RecentEvent | null;
  customPropertiesVersion: number;

  gates: GateApi;
  snapshotRequest: SnapshotRequest | null;
  isSnapshotReady: boolean;

  initialize: () => void;
  setAutoInitialize: (value: boolean) => void;
  appendLog: (entry: LogAppend) => void;
  track: (name: string, properties?: JsonMap) => Promise<void>;
  removeRecent: (index: number) => void;
  refireLastMatched: () => void;
  setCustomProperty: (key: string, value: string | number | boolean) => void;
  removeCustomProperty: (key: string) => void;
  clearCustomProperties: () => void;
  readSnapshot: (option: DataSetOptionId, eventName: string) => Promise<JsonMap | null>;
  reportSnapshotFocus: () => void;
};

const SampleContext = createContext<SampleContextValue | null>(null);

export function useSample(): SampleContextValue {
  const value = useContext(SampleContext);
  if (!value) {
    throw new Error('useSample must be used inside <AmplySampleProvider>');
  }
  return value;
}

type Props = {
  config: SampleTargetConfig;
  children: React.ReactNode;
};

/**
 * The app's single point of contact with the SDK.
 *
 * Everything on both screens is a projection of this provider, and everything in it came from an
 * SDK call or an SDK callback. Nothing is written into the log or the campaign list behind the
 * SDK's back — that is what makes a screenshot of a seeded sample evidence about the SDK rather
 * than evidence about the seeding code.
 */
export function AmplySampleProvider({config, children}: Props): React.JSX.Element {
  const [status, setStatus] = useState<SdkStatus>(() =>
    safeIsInitialized() ? 'ready' : 'not-initialized',
  );
  const [logs, setLogs] = useState<readonly LogRow[]>([]);
  const [recents, setRecents] = useState<readonly RecentEvent[]>([]);
  const [campaigns, setCampaigns] = useState<readonly CampaignRef[]>([]);
  const [lastDeepLink, setLastDeepLink] = useState<DeepLinkRecord | null>(null);
  const [lastMatchedEvent, setLastMatchedEvent] = useState<RecentEvent | null>(null);
  const [customPropertiesVersion, setCustomPropertiesVersion] = useState(0);
  const [autoInitialize, setAutoInitializeState] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [logLevel, setLogLevel] = useState('—');
  const [stored, setStored] = useState<StoredCredentials>(EMPTY_CREDENTIALS);
  const [snapshotRequest, setSnapshotRequest] = useState<SnapshotRequest | null>(null);
  const [isSnapshotReady, setSnapshotReady] = useState(false);

  const statusRef = useRef<SdkStatus>(status);
  statusRef.current = status;
  const initializeStartedRef = useRef(false);
  // Read inside `initialize`, which is memoised on `config` alone — a ref keeps the newest stored
  // values reachable there without re-creating the callback on every save.
  const storedRef = useRef<StoredCredentials>(stored);
  storedRef.current = stored;

  /**
   * What the SDK is actually given: the committed file with anything entered in the app laid over
   * it. Device before file — whoever just typed a key is the most recent instruction about which
   * backend this build should talk to (SAMPLE_APP_SPEC.md §5.5).
   */
  const resolved = useMemo(() => withStoredCredentials(config, stored), [config, stored]);

  const appendLog = useCallback((entry: LogAppend) => {
    setLogs(previous => appendRow(previous, entry));
  }, []);

  // ── Recent-events store (SAMPLE_APP_SPEC.md §6) ────────────────────────────────────────────
  const applyRecents = useCallback((next: RecentEvent[]) => {
    setRecents(next);
    void persistRecents(next);
  }, []);

  useEffect(() => {
    void loadRecents().then(setRecents);
  }, []);

  // Both settings and stored credentials have to be read BEFORE the first auto-initialise, or the
  // launch would use the committed placeholders and refuse while a perfectly good stored pair sat
  // one tick away.
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(AUTO_INIT_KEY).catch(() => null),
      loadCredentials(),
    ])
      .then(([autoInit, credentials]) => {
        if (autoInit === 'false') {
          setAutoInitializeState(false);
        }
        setStored(credentials);
        storedRef.current = credentials;
      })
      .catch(() => undefined)
      .finally(() => setSettingsLoaded(true));
  }, []);

  const setAutoInitialize = useCallback(
    (value: boolean) => {
      setAutoInitializeState(value);
      void AsyncStorage.setItem(AUTO_INIT_KEY, value ? 'true' : 'false');
      appendLog({
        kind: 'sdk',
        name: 'auto-initialize',
        note: value
          ? 'on — the SDK starts at launch'
          : 'off — the SDK stays down until Initialize',
      });
    },
    [appendLog],
  );

  /**
   * Re-reads the configuration after a save or a clear and says what changed, in the log.
   *
   * The SDK reads its configuration once, at construction, so this cannot re-point a running
   * instance — the editor says so rather than pretending. What it does do is clear a stale `failed`
   * chip: a chip still reading `failed` beside a filled-in key pair is the sample lying about
   * itself, because nothing has failed since the keys changed.
   */
  const applyConfigurationChange = useCallback(
    (next: StoredCredentials) => {
      const config2 = withStoredCredentials(config, next);
      if (!safeIsInitialized() && statusRef.current === 'failed') {
        setStatus('not-initialized');
        initializeStartedRef.current = false;
      }
      appendLog({
        kind: 'sdk',
        name: 'credentials',
        params: [
          {key: 'source', value: credentialSource(config, next)},
          {key: 'apiKeyPublic', value: maskCredential(config2.apiKeyPublic)},
          {key: 'apiKeySecret', value: maskCredential(config2.apiKeySecret)},
          {key: 'config', value: config2.configBaseUrl ?? 'sdk default (PRODUCTION)'},
          {key: 'backend', value: config2.backendBaseUrl ?? 'sdk default (PRODUCTION)'},
        ],
        severity: isUsable(config2) ? 'info' : 'warn',
      });
    },
    [appendLog, config],
  );

  const storeCredentials = useCallback(
    async (values: Record<CredentialField, string>) => {
      await saveCredentials(values);
      const next = await loadCredentials();
      setStored(next);
      storedRef.current = next;
      applyConfigurationChange(next);
    },
    [applyConfigurationChange],
  );

  const forgetCredentials = useCallback(async () => {
    await clearCredentials();
    const next = await loadCredentials();
    setStored(next);
    storedRef.current = next;
    applyConfigurationChange(next);
  }, [applyConfigurationChange]);

  // ── Initialisation ─────────────────────────────────────────────────────────────────────────
  const initialize = useCallback(() => {
    if (initializeStartedRef.current) {
      return;
    }
    initializeStartedRef.current = true;
    const resolved = withStoredCredentials(config, storedRef.current);

    // A sample that ships a placeholder key does not fail quietly — it talks to PRODUCTION.
    // `backendBaseUrl` is unset here, so the SDK falls back to its built-in production endpoints,
    // and every launch posts a session that is rejected for an unknown key. Measured 2026-08-30:
    // ~543 refusals a day in production Sentry from sample builds alone, and the Expo example was
    // still doing it on an emulator while this guard was being written. The KMP samples grew the
    // same guard (`AmplyBridge.initializeSdk`); this is its React Native half.
    //
    // Refusing is the whole point: an unusable key cannot produce a working sample, so starting
    // anyway buys nothing and costs a production incident.
    if (!isUsable(resolved)) {
      initializeStartedRef.current = false;
      setStatus('failed');
      appendLog({
        kind: 'sdk',
        name: 'initialize refused',
        severity: 'error',
        note: REFUSAL_REASON,
      });
      return;
    }

    setStatus('initializing');
    appendLog({
      kind: 'sdk',
      name: 'initialize',
      params: [
        {key: 'appId', value: resolved.appId},
        {key: 'channel', value: resolved.channel},
        {key: 'sdkVersion', value: sdkPackage.version},
        // Masked, never raw: this line goes to the console as well as the screen, and a sample is
        // the app most likely to end up in a screenshot.
        {key: 'apiKeyPublic', value: maskCredential(resolved.apiKeyPublic)},
        {key: 'credentials', value: credentialSource(config, storedRef.current)},
      ],
    });

    Amply.initialize({
      appId: resolved.appId,
      apiKeyPublic: resolved.apiKeyPublic,
      apiKeySecret: resolved.apiKeySecret,
      configBaseUrl: resolved.configBaseUrl ?? null,
      backendBaseUrl: resolved.backendBaseUrl ?? null,
      logLevel: 'debug',
    })
      .then(() => {
        setLogLevel(safeLogLevel());
        // `SdkInitialized` promotes the status to `ready`; the resolved promise only says the
        // native handle exists. `Session` returns without emitting it when the session store did
        // not start, and the chip must not claim `ready` on the strength of a handle.
      })
      .catch((error: unknown) => {
        setStatus('failed');
        appendLog({
          kind: 'sdk',
          name: 'initialize',
          note: ValueFormat.oneLine(`initialize threw: ${String(error)}`),
          severity: 'error',
        });
      });

    /**
     * `failed` is not a hypothetical state. The SDK can return from `initialize` without ever
     * emitting `SdkInitialized` — deliberately, so events stay queued for a later healthy
     * session. Without this the chip would sit on `initializing` forever and the sample would
     * look like it was still working.
     */
    setTimeout(() => {
      if (statusRef.current === 'initializing') {
        setStatus('failed');
        appendLog({
          kind: 'sdk',
          name: 'initialize',
          note: `SdkInitialized never arrived within ${INITIALIZATION_DEADLINE_MS / 1000}s — the handle exists but the session never became ready`,
          severity: 'error',
        });
      }
    }, INITIALIZATION_DEADLINE_MS);
  }, [appendLog, config]);

  useEffect(() => {
    if (!settingsLoaded || !autoInitialize) {
      return;
    }
    initialize();
  }, [autoInitialize, initialize, settingsLoaded]);

  // ── System events → the log, the status, the campaign list ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    Amply.addSystemEventListener((event: EventRecord) => {
      const properties = (event.properties ?? {}) as JsonMap;

      if (event.name === 'SdkInitialized') {
        setStatus('ready');
        setLogLevel(safeLogLevel());
      }
      if (event.name === 'CustomPropertyChanged') {
        setCustomPropertiesVersion(version => version + 1);
      }
      if (event.name === 'ConfigFetchFinished') {
        const list = Array.isArray(properties.campaigns) ? properties.campaigns : [];
        setCampaigns(
          list
            .filter((entry): entry is JsonMap => typeof entry === 'object' && entry !== null)
            .map(entry => ({
              id: String(entry.id ?? '—'),
              name: typeof entry.name === 'string' ? entry.name : '(unnamed)',
            })),
        );
      }

      // A failed config fetch is the single most common reason a campaign "does not fire", and it
      // is not an error the SDK raises — it is a boolean in a payload nobody reads.
      //
      // `=== false` alone missed it on iOS: that bridge delivers a Kotlin `Boolean` as an
      // NSNumber, so `success` arrives as `0`/`1` in JS and the strict comparison never matched.
      // Android sends a real boolean. Accept both shapes rather than trusting one platform's.
      const failedFetch =
        event.name === 'ConfigFetchFinished' &&
        (properties.success === false || properties.success === 0);

      // `EventTriggered` is the SDK acknowledging a call the app already logged. It renders as an
      // acknowledgement of that row (§5.3) rather than as a peer that re-lists its properties, so
      // both of its own params are dropped: `sourceEvent` is what the row is attached to, and
      // `properties` is the copy.
      const acknowledges =
        event.name === 'EventTriggered' && typeof properties.sourceEvent === 'string'
          ? properties.sourceEvent
          : null;
      appendLog({
        kind: kindForSystemEvent(event.name),
        name: event.name,
        params: LogValue.collapseOldNew(
          LogValue.paramsFrom(
            properties,
            Date.now(),
            acknowledges === null ? [] : ['sourceEvent', 'properties'],
          ),
        ),
        payload: properties,
        severity: failedFetch ? 'warn' : 'info',
        acknowledges,
      });
    })
      .then(remove => {
        if (cancelled) {
          remove();
        } else {
          unsubscribe = remove;
        }
      })
      .catch((error: unknown) => {
        appendLog({
          kind: 'sdk',
          name: 'addSystemEventListener',
          note: ValueFormat.oneLine(String(error)),
          severity: 'error',
        });
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [appendLog]);

  // ── The SDK's deep link listener → §4 Deeplink ─────────────────────────────────────────────
  const handleDeepLink = useCallback(
    (url: string, info: JsonMap) => {
      setLastDeepLink({url, info});
      const full = {url, ...info};
      appendLog({
        kind: 'deeplink',
        name: 'onDeepLink',
        params: LogValue.paramsFrom(full, Date.now()),
        payload: full,
      });
    },
    [appendLog],
  );

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    Amply.addDeepLinkListener(event => {
      handleDeepLink(event.url, (event.info ?? {}) as JsonMap);
    })
      .then(remove => {
        if (cancelled) {
          remove();
        } else {
          unsubscribe = remove;
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [handleDeepLink]);

  // ── Events ─────────────────────────────────────────────────────────────────────────────────
  const track = useCallback(
    async (name: string, properties: JsonMap = {}) => {
      if (!safeIsInitialized()) {
        appendLog({
          kind: 'event',
          name,
          note: 'not tracked — the SDK is not initialised',
          severity: 'error',
        });
        return;
      }
      try {
        await Amply.track({name, properties});
        appendLog({
          kind: 'event',
          name,
          params: LogValue.paramsFrom(properties, Date.now()),
          payload: properties,
        });
        setRecents(previous => {
          const next = recordRecent(previous, {name, properties});
          void persistRecents(next);
          return next;
        });
      } catch (error) {
        appendLog({
          kind: 'event',
          name,
          note: ValueFormat.oneLine(`track failed: ${String(error)}`),
          severity: 'error',
        });
      }
    },
    [appendLog],
  );

  const removeRecent = useCallback(
    (index: number) => {
      applyRecents(recents.filter((_, position) => position !== index));
    },
    [applyRecents, recents],
  );

  const noteMatchedEvent = useCallback((event: RecentEvent) => {
    setLastMatchedEvent(event);
  }, []);

  const refireLastMatched = useCallback(() => {
    if (lastMatchedEvent) {
      void track(lastMatchedEvent.name, lastMatchedEvent.properties);
    }
  }, [lastMatchedEvent, track]);

  // ── Custom properties ──────────────────────────────────────────────────────────────────────
  const setCustomProperty = useCallback((key: string, value: string | number | boolean) => {
    Amply.setCustomProperty(key, value);
  }, []);

  const removeCustomProperty = useCallback((key: string) => {
    Amply.removeCustomProperty(key);
  }, []);

  const clearCustomProperties = useCallback(() => {
    Amply.clearCustomProperties();
  }, []);

  // ── Datasets ───────────────────────────────────────────────────────────────────────────────
  const readSnapshot = useCallback(
    async (option: DataSetOptionId, eventName: string): Promise<JsonMap | null> => {
      if (!safeIsInitialized()) {
        return null;
      }
      try {
        return (await Amply.getDataSetSnapshot(dataSetTypeFor(option, eventName))) as JsonMap;
      } catch (error) {
        // Surfaced as an `error` row rather than an empty tree — "the SDK returned nothing" and
        // "the call threw" look identical on screen otherwise.
        appendLog({
          kind: 'sdk',
          name: 'getDataSetSnapshot',
          params: [
            {key: 'dataset', value: option},
            {key: 'error', value: ValueFormat.oneLine(String(error))},
          ],
          severity: 'error',
        });
        return null;
      }
    },
    [appendLog],
  );

  // ── Gates ──────────────────────────────────────────────────────────────────────────────────
  const gates = useGateController({
    isReady: status === 'ready',
    appendLog,
    noteMatchedEvent,
  });

  // ── The launch contract (SAMPLE_APP_SPEC.md §7) ────────────────────────────────────────────
  const requestRef = useRef<SnapshotRequest | null>(null);

  useEffect(() => {
    const consume = (url: string | null) => {
      if (!url) {
        return;
      }
      const request = readSnapshotRequest(url);
      if (!request || requestRef.current) {
        return;
      }
      requestRef.current = request;
      appendLog({
        kind: 'deeplink',
        name: 'amply.snapshot',
        params: [
          {key: 'screen', value: request.screen},
          {key: 'seed', value: request.seed},
        ],
        payload: {url, amplySnapshot: request.screen, amplySeed: request.seed},
      });
      // A snapshot always initialises: seeding is a script of real SDK calls, and there is
      // nothing to photograph without them.
      initialize();
      setSnapshotRequest(request);
    };

    const subscription = Linking.addEventListener('url', ({url}) => consume(url));
    void Linking.getInitialURL().then(consume);
    return () => subscription.remove();
  }, [appendLog, initialize]);

  /**
   * SAMPLE_APP_SPEC.md §7.2. REPLACES sample state rather than appending to it, so a second run
   * does not double up. Every line is a real SDK call: nothing is injected into the log, the
   * campaign list or the decision trace directly.
   */
  const seedRanRef = useRef(false);
  const [seedFinished, setSeedFinished] = useState(false);

  useEffect(() => {
    if (!snapshotRequest || seedRanRef.current) {
      return;
    }
    seedRanRef.current = true;

    if (!snapshotRequest.seed) {
      setSeedFinished(true);
      return;
    }

    let cancelled = false;
    const run = async () => {
      applyRecents([]);
      Amply.clearCustomProperties();

      // The SDK has to be past initialisation before an event can be recorded against a
      // session; tracking into a session that has not started queues rather than shows.
      const deadline = Date.now() + SEED_READY_DEADLINE_MS;
      while (statusRef.current !== 'ready' && Date.now() < deadline) {
        await delay(100);
      }
      if (cancelled) {
        return;
      }

      await track('Purchase', {product: 'pro'});
      await track('LevelFinished', {level: 7});
      await track('CheckOffers');

      Amply.setCustomProperty('plan', 'pro');
      Amply.setCustomProperty('level', 7);
      Amply.setCustomProperty('is_subscriber', true);
      // A fourth, deliberately: `level = 7` and `last_seen_at = <epoch millis>` are BOTH numbers
      // to the SDK, and one screenshot with both in it is what proves the datetime hint
      // discriminates rather than merely exists.
      Amply.setCustomProperty('last_seen_at', Date.now() - SEED_LAST_SEEN_AGO_MS);

      // One full gated round trip, with the presenter reporting Completed, so the decision trace
      // has a real entry in it rather than an empty state.
      gates.runSeededRound();
      await delay(1_500);
      if (!cancelled) {
        setSeedFinished(true);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // `gates` and `track` are stable enough for one run guarded by seedRanRef; re-running the
    // seed on a re-render is the "second run doubles up" failure the spec forbids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotRequest]);

  /**
   * The Campaigns tab has to render a populated Deeplink panel, and a real deeplink needs a live
   * campaign that the sample's placeholder credentials cannot fetch. So the delivery is simulated and the
   * payload SAYS SO: `source: snapshot-fixture` is in the panel and in the log row. Nothing else
   * in the sample fabricates campaign content, and this does not either — it fabricates a
   * delivery, visibly.
   */
  useEffect(() => {
    if (!snapshotRequest || !seedFinished || !targetFor(snapshotRequest.screen).deeplinkFixture) {
      return;
    }
    const url = 'amplysample://promo/summer?utm_source=amply';
    handleDeepLink(url, {
      url,
      campaignId: 'snapshot-fixture',
      campaignName: 'Snapshot fixture (no live campaign)',
      triggeringEvent: 'CheckOffers',
      source: 'snapshot-fixture',
    });
  }, [handleDeepLink, seedFinished, snapshotRequest]);

  /** Set by the target screen once it has scrolled itself into place with no animation. */
  const focusReportedRef = useRef(false);
  const reportSnapshotFocus = useCallback(() => {
    focusReportedRef.current = true;
  }, []);

  useEffect(() => {
    if (!snapshotRequest || !seedFinished || isSnapshotReady) {
      return;
    }
    let cancelled = false;

    const run = async () => {
      const deadline = Date.now() + READINESS_DEADLINE_MS;
      while (!cancelled && !isTerminal(statusRef.current) && Date.now() < deadline) {
        await delay(100);
      }
      if (!cancelled && !isTerminal(statusRef.current)) {
        appendLog({
          kind: 'sdk',
          name: 'amply.snapshot.ready',
          note: `marker forced after ${READINESS_DEADLINE_MS / 1000}s; status is still ${statusRef.current}`,
          severity: 'warn',
        });
      }
      // Two settle passes: one for the re-render the last state change triggers, one for the
      // layout pass it causes. The screen re-applies its own scroll on every content-size change
      // while the marker is down, so the frame under the marker is the framed one.
      while (!cancelled && !focusReportedRef.current && Date.now() < deadline + 3_000) {
        await delay(100);
      }
      await delay(600);
      if (!cancelled) {
        setSnapshotReady(true);
        // eslint-disable-next-line no-console
        console.log(`amply.snapshot.ready ${snapshotRequest.screen}`);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [appendLog, isSnapshotReady, seedFinished, snapshotRequest]);

  const value = useMemo<SampleContextValue>(
    () => ({
      config,
      resolved,
      isConfigurationUsable: isUsable(resolved),
      credentialSource: credentialSource(config, stored),
      storedCredentials: stored,
      hasStoredCredentials: hasStoredCredentials(stored),
      storeCredentials,
      forgetCredentials,
      status,
      sdkVersion: `${sdkPackage.version} (js)`,
      sessionText: 'n/a (SDK-GAP-2)',
      userId: 'not set',
      logLevel,
      autoInitialize,
      logs,
      recents,
      campaigns,
      lastDeepLink,
      lastMatchedEvent,
      customPropertiesVersion,
      gates,
      snapshotRequest,
      isSnapshotReady,
      initialize,
      setAutoInitialize,
      appendLog,
      track,
      removeRecent,
      refireLastMatched,
      setCustomProperty,
      removeCustomProperty,
      clearCustomProperties,
      readSnapshot,
      reportSnapshotFocus,
    }),
    [
      appendLog,
      autoInitialize,
      campaigns,
      clearCustomProperties,
      config,
      customPropertiesVersion,
      gates,
      initialize,
      isSnapshotReady,
      lastDeepLink,
      lastMatchedEvent,
      logLevel,
      logs,
      readSnapshot,
      recents,
      refireLastMatched,
      removeCustomProperty,
      removeRecent,
      reportSnapshotFocus,
      setAutoInitialize,
      setCustomProperty,
      snapshotRequest,
      status,
      stored,
      storeCredentials,
      forgetCredentials,
      resolved,
      track,
    ],
  );

  return <SampleContext.Provider value={value}>{children}</SampleContext.Provider>;
}

function isTerminal(status: SdkStatus): boolean {
  return status === 'ready' || status === 'failed';
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** `isInitialized()` throws when the native module is missing; a sample must say so, not crash. */
function safeIsInitialized(): boolean {
  try {
    return Amply.isInitialized();
  } catch {
    return false;
  }
}

function safeLogLevel(): string {
  try {
    return Amply.getLogLevel();
  } catch {
    return '—';
  }
}
