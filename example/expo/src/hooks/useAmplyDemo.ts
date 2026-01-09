import { useCallback, useEffect, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Amply, {
  formatSystemEventLabel,
  systemEvents,
} from '@amply/amply-react-native';
import { routeAmplyUrl } from '../utils/amplyDeepLinkRouter';

const SAMPLE_CONFIG = {
  appId: 'tools.amply.sample',
  apiKeyPublic: '58572785b5',
  apiKeySecret: 'cd81c4039052cae270d7',
} as const;

const AUTO_INIT_STORAGE_KEY = 'amply:autoInitialize';

export type LogEntry = {
  id: string;
  message: string;
  timestamp: Date;
};

export const useAmplyDemo = () => {
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [status, setStatus] = useState('Not initialized');
  const [eventsJson, setEventsJson] = useState<string>('[]');
  const [datasetJson, setDatasetJson] = useState<string>('{}');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [initialized, setInitialized] = useState(() => Amply.isInitialized());
  const [eventName, setEventName] = useState('Test');
  const [eventsUpdatedAt, setEventsUpdatedAt] = useState<Date | null>(null);
  const [datasetUpdatedAt, setDatasetUpdatedAt] = useState<Date | null>(null);
  const [logsUpdatedAt, setLogsUpdatedAt] = useState<Date | null>(null);
  const [deepLinkUpdatedAt, setDeepLinkUpdatedAt] = useState<Date | null>(null);
  const [autoInitialize, setAutoInitialize] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const logCounterRef = useRef(0);

  const appendLog = useCallback((message: string, timestampOverride?: Date) => {
    const timestamp = timestampOverride ?? new Date();
    const nextId = `${timestamp.getTime()}-${logCounterRef.current++}`;
    setLogs(prev => {
      const next = [...prev, { id: nextId, message, timestamp }].sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
      );
      return next;
    });
    setLogsUpdatedAt(new Date());
  }, []);

  // Log deep links from Linking API for demo UI visibility.
  // Navigation is handled separately in _layout.tsx via routeAmplyUrl().
  useEffect(() => {
    // Filter out Expo development client URLs - these are internal to Expo
    const isExpoDevClientUrl = (url: string) =>
      url.includes('expo-development-client');

    const handleUrl = ({ url }: { url: string }) => {
      if (isExpoDevClientUrl(url)) {
        return; // Skip Expo dev client URLs
      }
      setDeepLink(url);
      setDeepLinkUpdatedAt(new Date());
      appendLog(`Linking event: ${url}`);
    };

    const subscription = Linking.addEventListener('url', handleUrl);

    Linking.getInitialURL().then(initialUrl => {
      if (initialUrl && !isExpoDevClientUrl(initialUrl)) {
        setDeepLink(initialUrl);
        setDeepLinkUpdatedAt(new Date());
        appendLog(`Initial URL: ${initialUrl}`);
      }
    });

    return () => subscription.remove();
  }, [appendLog]);

  // Load auto-init setting
  useEffect(() => {
    AsyncStorage.getItem(AUTO_INIT_STORAGE_KEY)
      .then(value => {
        if (value === 'false') {
          setAutoInitialize(false);
        }
      })
      .catch(error => {
        appendLog(`Failed to load auto-init setting: ${String(error)}`);
      })
      .finally(() => {
        setSettingsLoaded(true);
      });
  }, [appendLog]);

  // Save auto-init setting
  useEffect(() => {
    if (!settingsLoaded) {
      return;
    }
    AsyncStorage.setItem(
      AUTO_INIT_STORAGE_KEY,
      autoInitialize ? 'true' : 'false',
    ).catch(error => {
      appendLog(`Failed to persist auto-init setting: ${String(error)}`);
    });
  }, [appendLog, autoInitialize, settingsLoaded]);

  // System events listener
  useEffect(() => {
    let unsubscribed = false;
    let unsubscribeFn: (() => void) | undefined;

    systemEvents
      .addListener(event =>
        appendLog(formatSystemEventLabel(event), new Date(event.timestamp)),
      )
      .then(unsubscribe => {
        if (unsubscribed) {
          unsubscribe();
        } else {
          unsubscribeFn = unsubscribe;
        }
      })
      .catch(error => {
        appendLog(`System event listener error: ${String(error)}`);
      });

    return () => {
      unsubscribed = true;
      unsubscribeFn?.();
    };
  }, [appendLog]);

  // Auto-initialize
  useEffect(() => {
    if (!settingsLoaded || !autoInitialize || initialized) {
      return;
    }
    initializeAmply();
  }, [autoInitialize, initialized, settingsLoaded]);

  // Listen for deep links triggered by Amply SDK campaigns.
  // This handles navigation for custom scheme URLs (e.g., amply://).
  // External URLs (http/https) are opened by native code via system Linking API.
  useEffect(() => {
    if (!initialized) {
      return;
    }

    let unsubscribed = false;
    let unsubscribeFn: (() => void) | undefined;

    Amply.addDeepLinkListener(event => {
      console.log('[Amply] Deep link listener received event:', event.url);
      setDeepLink(event.url);
      setDeepLinkUpdatedAt(new Date());
      appendLog(`SDK deep link: ${event.url} (consumed=${event.consumed})`);

      // Handle navigation for Amply deep links
      routeAmplyUrl(event.url);
    })
      .then(unsubscribe => {
        if (unsubscribed) {
          unsubscribe();
        } else {
          unsubscribeFn = unsubscribe;
        }
      })
      .catch(error => {
        appendLog(`Deep link listener error: ${String(error)}`);
      });

    return () => {
      unsubscribed = true;
      unsubscribeFn?.();
    };
  }, [appendLog, initialized]);

  // Update status when initialized
  useEffect(() => {
    if (initialized) {
      setStatus('Initialized');
    }
  }, [initialized]);

  // Auto-fetch device dataset after initialization
  useEffect(() => {
    if (!initialized) {
      return;
    }

    const fetchDataset = async () => {
      try {
        const snapshot = await Amply.getDataSetSnapshot({ kind: '@device' });
        setDatasetJson(JSON.stringify(snapshot, null, 2));
        setDatasetUpdatedAt(new Date());
        appendLog('Auto-fetched device dataset');
      } catch (error) {
        appendLog(`Dataset fetch error: ${String(error)}`);
      }
    };

    fetchDataset();
  }, [appendLog, initialized]);

  const initializeAmply = useCallback(async () => {
    try {
      setStatus('Initializing…');
      await Amply.initialize(SAMPLE_CONFIG);
      setStatus('Initialized');
      setInitialized(true);
      appendLog('Amply initialized successfully');
    } catch (error) {
      setStatus('Initialization failed');
      appendLog(`Init error: ${String(error)}`);
    }
  }, [appendLog]);

  const trackEvent = useCallback(
    async (name: string) => {
      try {
        const trimmedName = name.trim() || 'Test';
        await Amply.track({ name: trimmedName });
        const recent = await Amply.getRecentEvents(5);
        setEventsJson(JSON.stringify(recent, null, 2));
        setEventsUpdatedAt(new Date());
        appendLog(`Tracked event: ${trimmedName}`);
      } catch (error) {
        appendLog(`Track error: ${String(error)}`);
      }
    },
    [appendLog],
  );

  const handleTrack = useCallback(async () => {
    await trackEvent(eventName);
  }, [eventName, trackEvent]);

  const handleQuickTrack = useCallback(
    async (name: string) => {
      await trackEvent(name);
    },
    [trackEvent],
  );

  const handleRecentEvents = useCallback(async () => {
    try {
      const result = await Amply.getRecentEvents(5);
      setEventsJson(JSON.stringify(result, null, 2));
      setEventsUpdatedAt(new Date());
      appendLog('Fetched recent events');
    } catch (error) {
      appendLog(`Events error: ${String(error)}`);
    }
  }, [appendLog]);

  const handleDataSet = useCallback(async () => {
    try {
      const snapshot = await Amply.getDataSetSnapshot({ kind: '@device' });
      setDatasetJson(JSON.stringify(snapshot, null, 2));
      setDatasetUpdatedAt(new Date());
      appendLog('Fetched device dataset');
    } catch (error) {
      appendLog(`Dataset error: ${String(error)}`);
    }
  }, [appendLog]);

  const toggleAutoInit = useCallback(
    (value: boolean) => {
      setAutoInitialize(value);
      appendLog(value ? 'Auto-initialize enabled.' : 'Auto-initialize disabled.');
    },
    [appendLog],
  );

  return {
    status,
    initialized,
    autoInitialize,
    settingsLoaded,
    eventName,
    eventsJson,
    datasetJson,
    logs,
    eventsUpdatedAt,
    datasetUpdatedAt,
    logsUpdatedAt,
    deepLink,
    deepLinkUpdatedAt,
    setEventName,
    toggleAutoInit,
    handleTrack,
    handleQuickTrack,
    handleRecentEvents,
    handleDataSet,
    initializeAmply,
  };
};
