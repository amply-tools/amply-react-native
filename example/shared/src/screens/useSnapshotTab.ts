import {useCallback, useEffect, useRef, useState} from 'react';
import type {LayoutChangeEvent, ScrollView} from 'react-native';

import {Space} from '../theme';
import {targetFor, type SnapshotTarget, type TabId} from '../launchContract';
import {useSample} from '../SampleProvider';

/**
 * What the launch contract is asking of THIS tab, or nothing.
 *
 * A tab that is not the target gets `isTarget: false` and does nothing — which is how the
 * inertness guarantee (SAMPLE_APP_SPEC.md §7) reaches every screen without each one restating it.
 */
export function useSnapshotTab(tab: TabId): {
  isTarget: boolean;
  target: SnapshotTarget | null;
  reportFocus: () => void;
} {
  const {snapshotRequest, reportSnapshotFocus} = useSample();
  const target = snapshotRequest ? targetFor(snapshotRequest.screen) : null;
  const isTarget = target !== null && target.tab === tab;
  return {isTarget, target: isTarget ? target : null, reportFocus: reportSnapshotFocus};
}

/**
 * Puts a scrolling tab where a screenshot wants it, with no animation.
 *
 * Only the Inspect tab needs this — it is the one tab whose content is longer than a phone and
 * whose §7 ids name a block inside it. `anchor` is the section key the request asks for, or null
 * for "top".
 */
export function useSectionScroll(anchor: string | null, active: boolean) {
  const scrollRef = useRef<ScrollView | null>(null);
  const sections = useRef<Record<string, number>>({});
  const [viewportHeight, setViewportHeight] = useState(0);
  const [lastSectionHeight, setLastSectionHeight] = useState(0);
  const lastSectionKey = useRef<string | null>(null);

  const applyFocus = useCallback(() => {
    if (!active) {
      return;
    }
    const y = anchor === null ? 0 : (sections.current[anchor] ?? 0);
    // No animation, by contract: an animated scroll is a half-rendered screenshot.
    scrollRef.current?.scrollTo({y: Math.max(0, y - Space.lg), animated: false});
  }, [active, anchor]);

  const registerSection = useCallback(
    (key: string, isLast = false) =>
      (event: LayoutChangeEvent) => {
        sections.current[key] = event.nativeEvent.layout.y;
        if (isLast) {
          lastSectionKey.current = key;
          setLastSectionHeight(event.nativeEvent.layout.height);
        }
      },
    [],
  );

  const onScrollViewLayout = useCallback((event: LayoutChangeEvent) => {
    setViewportHeight(event.nativeEvent.layout.height);
  }, []);

  /**
   * Content keeps growing while the app settles, which moves every offset under it. Re-applying
   * on each content-size change is what makes the framed screenshot the one the marker lands on.
   */
  const onContentSizeChange = useCallback(() => applyFocus(), [applyFocus]);

  useEffect(() => {
    applyFocus();
  }, [applyFocus]);

  /**
   * Keeps the last block reachable at the top of the viewport. Without it a snapshot lands
   * wherever the content happens to end, and two runs with different amounts of content are
   * framed differently — which defeats the point of a deterministic screenshot.
   */
  const bottomInset = Math.max(0, viewportHeight - lastSectionHeight - 2 * Space.xl);

  return {scrollRef, registerSection, onScrollViewLayout, onContentSizeChange, bottomInset};
}
