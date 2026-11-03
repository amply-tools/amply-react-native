import React, {useCallback, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import * as amplitude from '@amplitude/analytics-react-native';
import {getRecentEvents} from '@amplytools/react-native-amply-sdk';
import {amplyPlugin} from '@amplytools/react-native-amply-sdk/amplitude';

/**
 * Amplitude in front of Amply: the host tracks with Amplitude as usual, and the one line
 * `amplitude.add(amplyPlugin())` is all it takes for the event to reach Amply on the device.
 *
 * Amplitude's key here is a placeholder, and `serverUrl` points at a local address that nothing
 * listens on by default, so running the demo sends nothing to Amplitude's servers.
 */
const DEMO_AMPLITUDE_KEY = 'demo-amplitude-key';
const DEMO_SERVER_URL = 'http://127.0.0.1:8198/2/httpapi';
const EVENT_NAME = 'Paywall Viewed';
const RECENT_LIMIT = 20;

/** Read by the plugin's `filter` on every event, so the switch below takes effect without re-adding. */
const filterState = {blocksPaywall: false};

amplitude.add(
  amplyPlugin({
    debug: true,
    filter: event => !(filterState.blocksPaywall && event.event_type === EVENT_NAME),
  }),
);
amplitude.init(DEMO_AMPLITUDE_KEY, undefined, {
  serverUrl: DEMO_SERVER_URL,
  trackingSessionEvents: false,
});

export function AmplitudeDemo(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [isBlocked, setIsBlocked] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const counter = useRef(0);

  const track = useCallback(async () => {
    counter.current += 1;
    const result = await amplitude.track(EVENT_NAME, {plan: 'pro'}).promise;
    setLines([`#${counter.current} track() result, first destination: code ${result.code}`]);
  }, []);

  const readAmply = useCallback(async () => {
    try {
      const records = await getRecentEvents(RECENT_LIMIT);
      const matching = records.filter(record => record.name === EVENT_NAME);
      const shown = matching.map(record => `${record.name} ${JSON.stringify(record.properties)}`);
      setLines([`Amply holds ${matching.length} x ${EVENT_NAME}`, ...shown.slice(0, 3)]);
    } catch (error) {
      setLines([`Amply events unavailable: ${error instanceof Error ? error.message : String(error)}`]);
    }
  }, []);

  const toggleFilter = useCallback((next: boolean) => {
    filterState.blocksPaywall = next;
    setIsBlocked(next);
  }, []);

  return (
    <View style={[styles.root, {paddingTop: insets.top + 6}]} testID="amplitude.demo">
      <View style={styles.row}>
        <Pressable accessibilityRole="button" onPress={track} style={styles.button} testID="amplitude.track">
          <Text style={styles.buttonText}>Track {EVENT_NAME}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={readAmply} style={styles.button} testID="amplitude.read">
          <Text style={styles.buttonText}>Amply events</Text>
        </Pressable>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{checked: isBlocked}}
          onPress={() => toggleFilter(!isBlocked)}
          style={[styles.button, styles.filterButton]}
          testID="amplitude.filter">
          <Text style={styles.buttonText}>filter {isBlocked ? 'on' : 'off'}</Text>
        </Pressable>
      </View>
      {lines.map((line, index) => (
        <Text key={`${index}-${line}`} style={styles.line} numberOfLines={1}>
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {backgroundColor: '#14161c', paddingHorizontal: 12, paddingBottom: 6},
  row: {flexDirection: 'row', alignItems: 'center', gap: 8},
  button: {backgroundColor: '#2a6df4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7},
  buttonText: {color: '#fff', fontSize: 13, fontWeight: '600'},
  filterButton: {backgroundColor: '#3a3f4b', marginLeft: 'auto'},
  line: {color: '#cfd3dc', fontSize: 11, marginTop: 3},
});
