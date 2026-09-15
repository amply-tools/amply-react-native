import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import {Space, Theme} from '../theme';
import {kindColour} from '../log';
import {recentLabel} from '../recentEvents';
import {useSample} from '../SampleProvider';
import {Caption, Card, Field, PrimaryButton, SectionHeader} from '../ui/primitives';
import {ParameterBuilder, rowsToProperties, type ParamRow} from '../ui/ParameterBuilder';
import {useSnapshotTab} from './useSnapshotTab';

/**
 * Events — the one place any event can be fired, plus the strip that makes firing it again cheap.
 *
 * The strip exists so that verifying a campaign does not mean retyping an event name on a phone
 * keyboard for the twentieth time.
 */
export function EventsScreen(): React.JSX.Element {
  const sample = useSample();
  const {isTarget, reportFocus} = useSnapshotTab('events');

  const [eventName, setEventName] = useState('Purchase');
  const [parameters, setParameters] = useState<ParamRow[]>([]);

  useEffect(() => {
    if (isTarget) {
      reportFocus();
    }
  }, [isTarget, reportFocus]);

  // No parse-error path: the type is chosen on each row rather than guessed from the text, so
  // there is no input the builder can produce that the SDK would have to reject.
  const trackNow = () => {
    const name = eventName.trim();
    if (name.length === 0) {
      return;
    }
    void sample.track(name, rowsToProperties(parameters));
  };

  return (
    <ScrollView
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}>
      <Card>
        <SectionHeader title="Events" />
        <View style={styles.row}>
          <Field
            testID="amply.events.name"
            value={eventName}
            onChangeText={setEventName}
            placeholder="Event name"
          />
          <PrimaryButton
            testID="amply.events.track"
            title="Track"
            onPress={trackNow}
            disabled={eventName.trim().length === 0}
            style={styles.trackButton}
          />
        </View>
        <Caption>Parameters</Caption>
        <View testID="amply.events.properties">
          <ParameterBuilder
            variant="events"
            rows={parameters}
            onChange={setParameters}
            add={{testID: 'amply.events.properties.add', title: '＋ Add parameter'}}
          />
        </View>
        <Text style={styles.note}>
          The type is picked, not guessed. A property&apos;s type is what targeting compares on, and
          a level stored as text never matching a rule that reads it as a number is the commonest
          way a campaign silently does not fire.
        </Text>
      </Card>

      <Card>
        <SectionHeader title="Recent" />
        <Caption>Tap to re-fire, ✕ to remove · max 12, kept across launches</Caption>
        <RecentStrip>
          {sample.recents.map((entry, index) => (
            <FadingChip key={`${entry.name}-${index}`} index={index}>
              {/* The chip carries the manifest id; the two real tap targets carry their own, so a
                  harness can re-fire or remove a specific chip rather than guessing at
                  coordinates. React Native prunes a plain container from the iOS accessibility
                  tree, so the id on the wrapper alone would be in the source and nowhere else —
                  the same trap the readiness marker fell into. */}
              <View testID={`amply.events.recent.chip.${index}`} style={styles.recentChip}>
                <Pressable
                  testID={`amply.events.recent.chip.${index}.fire`}
                  accessibilityRole="button"
                  accessibilityLabel={`Re-fire ${entry.name}`}
                  onPress={() => void sample.track(entry.name, entry.properties)}>
                  <Text style={styles.recentChipText}>{recentLabel(entry)}</Text>
                </Pressable>
                <Pressable
                  testID={`amply.events.recent.chip.${index}.remove`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${entry.name}`}
                  hitSlop={8}
                  onPress={() => sample.removeRecent(index)}>
                  <Text style={styles.recentChipRemove}>✕</Text>
                </Pressable>
              </View>
            </FadingChip>
          ))}
        </RecentStrip>
        {sample.recents.length === 0 ? (
          <Text style={styles.empty}>Nothing tracked yet.</Text>
        ) : null}
      </Card>
    </ScrollView>
  );
}


/**
 * The trailing edge of the Recent strip dissolves instead of slicing.
 *
 * A chip cut in half by a boundary reads as a rendering fault; a chip fading out reads as "there is
 * more this way". Used for the Recent strip and nothing else: the two CONTROL rows — the log
 * filters and the dataset picker — wrap instead, because for them a hidden option is a lost one. A
 * history strip is different: twelve variable-length labels would wrap to five lines and bury the
 * tab, and its entries are ones you just fired, so the useful ones are already at the front.
 *
 * **Alpha only, never paint.** The native samples mask the layer with a `DstIn` gradient so the
 * fade carries no colour of its own and cannot disagree with the theme behind it. React Native has
 * no mask primitive in core — `mixBlendMode` offers the CSS blend modes but not the `destination-in`
 * COMPOSITING operator, and the only real masked view is a native module, which this example (the
 * release gate) does not get to grow for a fade. So the alpha is applied to the chips themselves
 * from their position under the viewport's right edge: still nothing but alpha, still theme-proof,
 * quantised to a chip rather than to a pixel. Opacity does not remove a view from the accessibility
 * tree, so every `amply.events.recent.chip.<i>` stays addressable.
 */
const FADE_WIDTH = 28;
/** Never fully transparent: a chip a harness cannot see is worse than one a reader cannot read. */
const FADE_FLOOR = 0.2;

type ChipBox = {x: number; width: number};

const RecentStripContext = React.createContext<{
  register: (index: number, box: ChipBox) => void;
  opacityFor: (index: number) => number;
} | null>(null);

function RecentStrip({children}: {children: React.ReactNode}): React.JSX.Element {
  const boxes = useRef<Record<number, ChipBox>>({});
  const [scrollX, setScrollX] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  // Re-render on measurement, without making every chip layout a state write.
  const [, bump] = useState(0);

  const register = useCallback((index: number, box: ChipBox) => {
    const previous = boxes.current[index];
    if (previous && Math.abs(previous.x - box.x) < 0.5 && Math.abs(previous.width - box.width) < 0.5) {
      return;
    }
    boxes.current[index] = box;
    bump(value => value + 1);
  }, []);

  const opacityFor = useCallback(
    (index: number) => {
      const box = boxes.current[index];
      // Nothing to scroll to means nothing to fade: a short strip is fully in view.
      if (!box || viewport === 0 || content <= viewport + 1) {
        return 1;
      }
      const distance = scrollX + viewport - (box.x + box.width);
      const ramp = Math.max(0, Math.min(1, distance / FADE_WIDTH));
      return FADE_FLOOR + (1 - FADE_FLOOR) * ramp;
    },
    [content, scrollX, viewport],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      setScrollX(event.nativeEvent.contentOffset.x),
    [],
  );

  return (
    <RecentStripContext.Provider value={{register, opacityFor}}>
      <ScrollView
        testID="amply.events.recent"
        horizontal
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        onLayout={(event: LayoutChangeEvent) => setViewport(event.nativeEvent.layout.width)}
        onContentSizeChange={width => setContent(width)}
        contentContainerStyle={styles.recentRow}>
        {children}
      </ScrollView>
    </RecentStripContext.Provider>
  );
}

function FadingChip({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}): React.JSX.Element {
  const strip = React.useContext(RecentStripContext);
  return (
    <View
      onLayout={event =>
        strip?.register(index, {
          x: event.nativeEvent.layout.x,
          width: event.nativeEvent.layout.width,
        })
      }
      style={{opacity: strip ? strip.opacityFor(index) : 1}}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Space.lg,
    gap: Space.lg,
  },
  row: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'center',
  },
  trackButton: {
    width: 92,
  },
  recentRow: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'center',
    paddingRight: Space.lg,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 12,
    backgroundColor: `${kindColour.event}24`,
  },
  recentChipText: {
    color: kindColour.event,
    fontSize: 13,
    fontWeight: '500',
  },
  recentChipRemove: {
    color: Theme.secondaryLabel,
    fontSize: 12,
    fontWeight: '700',
  },
  note: {
    color: Theme.tertiaryLabel,
    fontSize: 12,
  },
  empty: {
    color: Theme.tertiaryLabel,
    fontSize: 13,
  },
});
