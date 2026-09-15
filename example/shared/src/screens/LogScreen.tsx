import React, {useEffect, useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';

import {Space, Theme} from '../theme';
import type {LogFilter} from '../log';
import {useSample} from '../SampleProvider';
import {Separator} from '../ui/primitives';
import {LogFilterBar, LogList} from '../ui/LogSection';
import {useSnapshotTab} from './useSnapshotTab';

/**
 * Log — the structured log, full height, and **the only log in the app**.
 *
 * No card, and no heading. The tab is already called `Log`; a card inside it headed `SYSTEM LOG`
 * said the same thing twice — in the exact phrase that made the founder ask which of the two lists
 * was which. The card's own inset went with it: it existed to separate this list from neighbours on
 * a screen it no longer shares with anything, and doubled up it was forcing `gate.decision` to
 * wrap. The list IS the tab, so the filters sit directly under the tab title.
 *
 * Every row is derived from something the SDK actually emits (§5). The emoji prefixes, the
 * listener-adapter chatter and the polling commentary that made the old log unreadable are
 * deliberately absent: they belong at `debug` level in the SDK's own logger, not in a UI list.
 */
export function LogScreen(): React.JSX.Element {
  const sample = useSample();
  const {isTarget, target, reportFocus} = useSnapshotTab('log');
  const [filter, setFilter] = useState<LogFilter>('all');

  // The filter selection is deliberately NOT persisted — a filter surviving a relaunch hides rows
  // and reads as a bug. The launch contract is the one thing that may set it.
  useEffect(() => {
    if (!isTarget || !target?.filter) {
      return;
    }
    if (filter !== target.filter) {
      setFilter(target.filter);
      return;
    }
    reportFocus();
  }, [filter, isTarget, reportFocus, target]);

  return (
    <View style={styles.root}>
      {/* Pinned rather than scrolled away with the rows: the filter is how you read the list, and
          a control that leaves the screen the moment you use the list is not a control. */}
      <View style={styles.controls}>
        <LogFilterBar selected={filter} onSelect={setFilter} />
        {/* `amply.log.source.sdk` is native-only: React Native has no `setLogListener` bridge
            (SDK-GAP-3), so this log carries system events only and no such control exists. The
            manifest records that as a `-`, which is why there is no stub here — the SDK's own
            logger lines still go to the console, they are simply not a source this list can
            switch on. */}
        <Text style={styles.note}>
          System events only — React Native has no setLogListener bridge (SDK-GAP-3).
        </Text>
      </View>
      <Separator />
      <ScrollView contentContainerStyle={styles.content}>
        <LogList testID="amply.log.list" rows={sample.logs} filter={filter} limit={200} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  controls: {
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    gap: Space.sm,
  },
  content: {
    paddingHorizontal: Space.lg,
    paddingBottom: Space.lg,
  },
  note: {
    color: Theme.tertiaryLabel,
    fontSize: 12,
  },
});
