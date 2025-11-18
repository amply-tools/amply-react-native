import React from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {useAmplyDemo} from '../hooks/useAmplyDemo';
import {formatTimestamp} from '../utils/formatTimestamp';

export function HomeScreen(): React.JSX.Element {
  const {
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
    setEventName,
    toggleAutoInit,
    handleTrack,
    handleQuickTrack,
    handleRecentEvents,
    handleDataSet,
    deepLink,
    deepLinkUpdatedAt,
  } = useAmplyDemo();

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <View style={styles.section}>
          <View style={styles.headerRow}>
            <Text style={styles.subtitle}>Amply status</Text>
            <Text
              style={[
                styles.statusBadge,
                initialized ? styles.statusBadgeReady : styles.statusBadgeIdle,
              ]}>
              {status}
            </Text>
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Initialize on start</Text>
            <Switch
              value={autoInitialize}
              onValueChange={toggleAutoInit}
              disabled={!settingsLoaded}
            />
          </View>
          <View style={styles.buttonsColumn}>
            <View style={styles.buttonWrapper}>
              <Text style={styles.label}>Event name</Text>
              <View style={styles.inlineRow}>
                <TextInput
                  value={eventName}
                  onChangeText={setEventName}
                  placeholder="Event name"
                  style={styles.inputInline}
                />
                <Pressable
                  android_ripple={{color: 'rgba(255,255,255,0.18)'}}
                  style={({pressed}) => [
                    styles.primaryButton,
                    styles.inlineButton,
                    pressed && styles.primaryButtonPressed,
                    !initialized && styles.primaryButtonDisabled,
                  ]}
                  onPress={handleTrack}
                  disabled={!initialized}>
                  <Text style={styles.primaryButtonText}>Track</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.actionsRow}>
              <Pressable
                android_ripple={{color: 'rgba(255,255,255,0.18)'}}
                style={({pressed}) => [
                  styles.secondaryButton,
                  pressed && styles.primaryButtonPressed,
                  !initialized && styles.primaryButtonDisabled,
                ]}
                onPress={() => handleQuickTrack('TriggerDeeplink')}
                disabled={!initialized}>
                <Text style={styles.secondaryButtonText}>Trigger Deeplink</Text>
              </Pressable>
              <Pressable
                android_ripple={{color: 'rgba(255,255,255,0.18)'}}
                style={({pressed}) => [
                  styles.secondaryButton,
                  pressed && styles.primaryButtonPressed,
                  !initialized && styles.primaryButtonDisabled,
                ]}
                onPress={() => handleQuickTrack('TriggerRateReview')}
                disabled={!initialized}>
                <Text style={styles.secondaryButtonText}>Trigger Rate Review</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Pressable
              android_ripple={{color: 'rgba(0,0,0,0.08)'}}
              style={({pressed}) => [
                styles.refreshButton,
                pressed && styles.refreshButtonPressed,
                !initialized && styles.primaryButtonDisabled,
              ]}
              onPress={handleRecentEvents}
              disabled={!initialized}>
              <Text style={styles.refreshButtonLabel}>🔄</Text>
            </Pressable>
            <View style={styles.headingRow}>
              <Text style={styles.heading}>Recent Events</Text>
              {eventsUpdatedAt ? (
                <Text style={[styles.statusBadge, styles.timestampBadge]}>
                  {formatTimestamp(eventsUpdatedAt)}
                </Text>
              ) : null}
            </View>
          </View>
          <Text style={styles.mono}>{eventsJson}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Pressable
              android_ripple={{color: 'rgba(0,0,0,0.08)'}}
              style={({pressed}) => [
                styles.refreshButton,
                pressed && styles.refreshButtonPressed,
                !initialized && styles.primaryButtonDisabled,
              ]}
              onPress={handleDataSet}
              disabled={!initialized}>
              <Text style={styles.refreshButtonLabel}>🔄</Text>
            </Pressable>
            <View style={styles.headingRow}>
              <Text style={styles.heading}>@device Data Set</Text>
              {datasetUpdatedAt ? (
                <Text style={[styles.statusBadge, styles.timestampBadge]}>
                  {formatTimestamp(datasetUpdatedAt)}
                </Text>
              ) : null}
            </View>
          </View>
          <Text style={styles.mono}>{datasetJson}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.headingRow}>
              <Text style={styles.heading}>Log</Text>
              {logsUpdatedAt ? (
                <Text style={[styles.statusBadge, styles.timestampBadge]}>
                  {formatTimestamp(logsUpdatedAt)}
                </Text>
              ) : null}
            </View>
          </View>
          {logs.map(({id, message, timestamp}) => (
            <Text key={id} style={styles.logEntry}>
              {formatTimestamp(timestamp)} — {message}
            </Text>
          ))}
        </View>
        {deepLink ? (
          <View style={styles.section}>
            <View style={styles.headingRow}>
              <Text style={styles.heading}>Latest Deeplink</Text>
              {deepLinkUpdatedAt ? (
                <Text style={[styles.statusBadge, styles.timestampBadge]}>
                  {formatTimestamp(deepLinkUpdatedAt)}
                </Text>
              ) : null}
            </View>
            <Text style={styles.mono}>{deepLink}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  section: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  subtitle: {
    marginBottom: 12,
    color: '#444',
    fontSize: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  toggleRow: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontSize: 16,
    color: '#222',
  },
  label: {
    fontSize: 14,
    color: '#222',
    marginBottom: 4,
  },
  inputInline: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1d4ed8',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  heading: {
    fontSize: 18,
    fontWeight: '500',
  },
  mono: {
    fontFamily: 'Courier',
    fontSize: 13,
    color: '#222',
  },
  logEntry: {
    fontSize: 13,
    color: '#444',
    marginBottom: 4,
  },
  primaryButton: {
    backgroundColor: '#2c6bed',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  primaryButtonPressed: {
    opacity: 0.7,
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonsColumn: {
    marginTop: 12,
  },
  buttonWrapper: {
    marginBottom: 12,
    alignSelf: 'stretch',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineButton: {
    paddingHorizontal: 20,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#2c6bed',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  refreshButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshButtonPressed: {
    backgroundColor: '#eef2ff',
  },
  refreshButtonLabel: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textTransform: 'uppercase',
  },
  statusBadgeReady: {
    backgroundColor: '#16a34a',
  },
  statusBadgeIdle: {
    backgroundColor: '#dc2626',
  },
  timestampBadge: {
    backgroundColor: '#1f2937',
  },
});
