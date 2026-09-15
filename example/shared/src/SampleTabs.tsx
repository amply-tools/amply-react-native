import React, {useEffect, useState} from 'react';
import {Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {Space, Theme} from './theme';
import {TABS, targetFor, type TabId} from './launchContract';
import {useSample} from './SampleProvider';
import {SdkScreen} from './screens/SdkScreen';
import {EventsScreen} from './screens/EventsScreen';
import {CampaignsScreen} from './screens/CampaignsScreen';
import {InspectScreen} from './screens/InspectScreen';
import {LogScreen} from './screens/LogScreen';
import {SnapshotReadyMarker} from './ui/SnapshotReadyMarker';

/**
 * The sample's shell: five tabs, in the order the spec fixes — SDK · Events · Campaigns ·
 * Inspect · Log. Tab order carries the ordering the old single-scroll screen carried in its
 * section numbers, so a screenshot of any two samples is still comparable tab by tab.
 *
 * The shell lives HERE rather than in each host on purpose. Navigation that differs between the
 * two examples is navigation that can drift between them, and the tab switch is also what the
 * launch contract drives — implementing it twice would mean implementing the tricky half of §7
 * twice. What genuinely differs stays with the host: safe-area provider, status bar, the URL
 * schemes registered natively, and the target config.
 */
/**
 * How much room the tab bar leaves at the bottom on Android, when the reported safe-area inset
 * asks for less.
 *
 * Measured on a Galaxy running API 36: `useSafeAreaInsets().bottom` is **14.9dp** while the
 * system's own navigation bar is drawn translucent over roughly 40dp of the app. Padding by the
 * reported inset alone put the tab labels underneath the back/home/recents buttons. Android 16
 * enforces edge-to-edge whatever `edgeToEdgeEnabled` says, so this is not something the sample
 * can opt out of, and clearing it properly would mean adding `react-native-edge-to-edge` — a new
 * native dependency in the one example that gates every SDK release.
 */
const ANDROID_NAV_CLEARANCE = 40;

export function SampleTabs(): React.JSX.Element {
  const {snapshotRequest, isSnapshotReady} = useSample();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabId>('sdk');

  // The launch contract picks the tab — no tap, no animation (a tab switch has none).
  useEffect(() => {
    if (snapshotRequest) {
      setTab(targetFor(snapshotRequest.screen).tab);
    }
  }, [snapshotRequest]);

  return (
    <View style={[styles.root, {paddingTop: insets.top}]}>
      <View style={styles.body}>
        {tab === 'sdk' ? <SdkScreen onOpenInspect={() => setTab('inspect')} /> : null}
        {tab === 'events' ? <EventsScreen /> : null}
        {tab === 'campaigns' ? <CampaignsScreen /> : null}
        {tab === 'inspect' ? <InspectScreen /> : null}
        {tab === 'log' ? <LogScreen /> : null}
      </View>

      <View
        style={[
          styles.tabBar,
          {
            paddingBottom: Math.max(
              insets.bottom,
              Platform.OS === 'android' ? ANDROID_NAV_CLEARANCE : Space.sm,
            ),
          },
        ]}>
        {TABS.map(entry => {
          const isOn = entry.id === tab;
          return (
            <Pressable
              key={entry.id}
              testID={`amply.tab.${entry.id}`}
              accessibilityRole="tab"
              accessibilityState={{selected: isOn}}
              accessibilityLabel={entry.title}
              onPress={() => setTab(entry.id)}
              style={styles.tab}>
              <Text style={[styles.tabText, {color: isOn ? Theme.accent : Theme.tertiaryLabel}]}>
                {entry.title}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <SnapshotReadyMarker visible={isSnapshotReady} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Theme.page,
  },
  body: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Theme.separator,
    backgroundColor: Theme.card,
    paddingTop: Space.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xs,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
