import {useCallback, useEffect, useRef, useState} from 'react';
import type {EventRecord} from '../nativeSpecs/NativeAmplyModule';
import {addSystemEventListener} from '../systemEvents';

export type UseAmplySystemEventsOptions = {
  maxEntries?: number;
  dedupe?: boolean;
  onEvent?: (event: EventRecord) => void;
};

export type UseAmplySystemEventsResult = {
  events: EventRecord[];
  reset: () => void;
};

export function useAmplySystemEvents(
  options: UseAmplySystemEventsOptions = {},
): UseAmplySystemEventsResult {
  const {maxEntries = 50, dedupe = true, onEvent} = options;
  const [events, setEvents] = useState<EventRecord[]>([]);
  const seenKeysRef = useRef<Set<string>>(new Set());
  const handlerRef = useRef<typeof onEvent>(onEvent);

  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let isMounted = true;

    addSystemEventListener(event => {
      if (!isMounted) {
        return;
      }
      if (dedupe) {
        const key = `${event.name}-${event.timestamp}`;
        if (seenKeysRef.current.has(key)) {
          return;
        }
        seenKeysRef.current.add(key);
      }
      handlerRef.current?.(event);
      setEvents(prev => {
        const next = [...prev, event];
        if (next.length > maxEntries) {
          next.splice(0, next.length - maxEntries);
        }
        return next;
      });
    })
      .then(unsub => {
        if (!isMounted) {
          unsub();
        } else {
          unsubscribe = unsub;
        }
      })
      .catch(error => {
        console.warn('[Amply] system event listener error', error);
      });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [dedupe, maxEntries]);

  const reset = useCallback(() => {
    seenKeysRef.current.clear();
    setEvents([]);
  }, []);

  return {events, reset};
}
