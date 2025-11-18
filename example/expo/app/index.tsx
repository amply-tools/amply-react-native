import { useCallback, useMemo } from 'react';
import {
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { useAmplyDemo } from '../src/hooks/useAmplyDemo';
import { formatTimestamp } from '../src/utils/formatTimestamp';

export default function HomeScreen() {
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
    deepLink,
    deepLinkUpdatedAt,
    setEventName,
    toggleAutoInit,
    handleTrack,
    handleQuickTrack,
    handleRecentEvents,
    handleDataSet,
    initializeAmply,
  } = useAmplyDemo();

  const statusColor = initialized ? '#16a34a' : '#dc2626';

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.scroll}>
      {/* Status Section */}
      <View style={styles.section}>
        <View style={styles.headerRow}>
          <Text style={styles.subtitle}>Amply status</Text>
          <Text style={[styles.statusBadge, { backgroundColor: statusColor }]}>
            {status}
          </Text>
        </View>

        {!initialized && (
          <TouchableOpacity
            style={[styles.primaryButton, styles.marginTop]}
            onPress={initializeAmply}>
            <Text style={styles.primaryButtonText}>Initialize Amply</Text>
          </TouchableOpacity>
        )}

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Auto-initialize on start</Text>
          <Switch
            value={autoInitialize}
            onValueChange={toggleAutoInit}
            disabled={!settingsLoaded}
          />
        </View>
      </View>

      {/* Event Tracking Section */}
      <View style={styles.section}>
        <Text style={styles.label}>Track Event</Text>
        <View style={styles.inlineRow}>
          <TextInput
            value={eventName}
            onChangeText={setEventName}
            placeholder="Event name"
            style={[styles.inputInline, { flex: 1 }]}
          />
          <TouchableOpacity
            style={[
              styles.primaryButton,
              styles.inlineButton,
              !initialized && styles.buttonDisabled,
            ]}
            onPress={handleTrack}
            disabled={!initialized}>
            <Text style={styles.primaryButtonText}>Track</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[
              styles.secondaryButton,
              !initialized && styles.buttonDisabled,
            ]}
            onPress={() => handleQuickTrack('TriggerDeeplink')}
            disabled={!initialized}>
            <Text style={styles.secondaryButtonText}>Trigger Deeplink</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.secondaryButton,
              !initialized && styles.buttonDisabled,
            ]}
            onPress={() => handleQuickTrack('TriggerRateReview')}
            disabled={!initialized}>
            <Text style={styles.secondaryButtonText}>Trigger Rate Review</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recent Events Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity
            style={[
              styles.refreshButton,
              !initialized && styles.buttonDisabled,
            ]}
            onPress={handleRecentEvents}
            disabled={!initialized}>
            <Text style={styles.refreshButtonLabel}>🔄</Text>
          </TouchableOpacity>
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

      {/* Dataset Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <TouchableOpacity
            style={[
              styles.refreshButton,
              !initialized && styles.buttonDisabled,
            ]}
            onPress={handleDataSet}
            disabled={!initialized}>
            <Text style={styles.refreshButtonLabel}>🔄</Text>
          </TouchableOpacity>
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

      {/* Logs Section */}
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
        {logs.map(({ id, message, timestamp }) => (
          <Text key={id} style={styles.logEntry}>
            {formatTimestamp(timestamp)} — {message}
          </Text>
        ))}
      </View>

      {/* Deeplink Section */}
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
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#fff',
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
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
    borderWidth: 1,
    borderColor: '#1d4ed8',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    color: '#222',
  },
  mono: {
    fontFamily: 'Courier',
    fontSize: 12,
    color: '#222',
    marginTop: 8,
  },
  logEntry: {
    fontSize: 12,
    color: '#444',
    marginBottom: 4,
  },
  primaryButton: {
    backgroundColor: '#2c6bed',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#2c6bed',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineButton: {
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
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
    padding: 8,
  },
  refreshButtonLabel: {
    fontSize: 20,
    fontWeight: '700',
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    overflow: 'hidden',
  },
  timestampBadge: {
    backgroundColor: '#1f2937',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  marginTop: {
    marginTop: 12,
  },
});
