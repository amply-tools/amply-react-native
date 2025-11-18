import {useCallback, useEffect, useRef, useState} from 'react';
import {Linking} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Amply, {
  formatSystemEventLabel,
  systemEvents,
} from '@amply/amply-react-native';
import {routeAmplyUrl} from '../utils/amplyDeepLinkRouter';

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
      const next = [...prev, {id: nextId, message, timestamp}].sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
      );
      return next;
    });
    setLogsUpdatedAt(new Date());
  }, []);

  useEffect(() => {
    const handleUrl = (payload: {url: string}) => {
      const {url} = payload;
      setDeepLink(url);
      setDeepLinkUpdatedAt(new Date());
      appendLog(`Linking event: ${url}`);
    };

    const subscription = Linking.addEventListener('url', handleUrl);

    Linking.getInitialURL().then(initialUrl => {
      if (initialUrl) {
        setDeepLink(initialUrl);
        setDeepLinkUpdatedAt(new Date());
        appendLog(`Initial URL: ${initialUrl}`);
      }
    });

    return () => subscription.remove();
  }, [appendLog]);

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

  const initializeAmply = useCallback(async () => {
    try {
      setStatus('Initializing…');
      await Amply.initialize(SAMPLE_CONFIG);
      setStatus('Initialized');
      setInitialized(true);
    } catch (error) {
      setStatus('Initialization failed');
      appendLog(`Init error: ${String(error)}`);
    }
  }, [appendLog]);

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

  useEffect(() => {
    if (!settingsLoaded || !autoInitialize || initialized) {
      return;
    }
    initializeAmply();
  }, [autoInitialize, initializeAmply, initialized, settingsLoaded]);

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
      appendLog(`Deep link ${event.url} (consumed=${event.consumed})`);
      if (!event.consumed) {
        const handledInternally = routeAmplyUrl(event.url);
        if (handledInternally) {
          appendLog(`Navigated to promo with ${event.url}.`);
        } else {
          appendLog(`Opening external URL ${event.url}.`);
        }
      }
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

  useEffect(() => {
    if (initialized) {
      setStatus('Initialized');
    }
  }, [initialized]);

  const trackEvent = useCallback(
    async (name: string) => {
      try {
        const trimmedName = name.trim() || 'Test';
        await Amply.track({name: trimmedName});
        const recent = await Amply.getRecentEvents(5);
        setEventsJson(JSON.stringify(recent, null, 2));
        setEventsUpdatedAt(new Date());
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
    } catch (error) {
      appendLog(`Events error: ${String(error)}`);
    }
  }, [appendLog]);

  const handleDataSet = useCallback(async () => {
    try {
      const snapshot = await Amply.getDataSetSnapshot({kind: '@device'});
      setDatasetJson(JSON.stringify(snapshot, null, 2));
      setDatasetUpdatedAt(new Date());
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
  };
};
