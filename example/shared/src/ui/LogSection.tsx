import React, {useCallback, useMemo, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {Space, Theme, monoFamily} from '../theme';
import {
  LOG_FILTERS,
  LogValue,
  causeIsAdjacent,
  filterColour,
  filterMatches,
  formatLogTime,
  isExpandable,
  rowColour,
  type LogFilter,
  type LogParam,
  type LogRow,
} from '../log';
import {KeyValueTree} from './KeyValueTree';
import {Separator} from './primitives';

/**
 * The single-select filter row. Every chip carries its own id — `amply.log.filter.<kind>` —
 * because "which chip" is exactly what a screenshot harness has to be able to say. The container
 * carries the plain `amply.log.filter` the manifest requires.
 *
 * It **wraps** rather than scrolling. There are nine kinds and only five fit a phone's width; as a
 * scrolling row the last one was sliced in half by the screen edge, which reads as a rendering
 * fault rather than as an invitation to swipe, and the four filters past the fold were invisible.
 * A filter nobody knows exists is a filter nobody uses. Wrapping also makes "never bisect a chip
 * at rest" structural instead of something a scroll position has to be trusted to respect.
 */
export function LogFilterBar({
  selected,
  onSelect,
}: {
  selected: LogFilter;
  onSelect: (filter: LogFilter) => void;
}): React.JSX.Element {
  return (
    <View testID="amply.log.filter" style={styles.filterRow}>
      {LOG_FILTERS.map(filter => {
        const isOn = filter === selected;
        return (
          <Pressable
            key={filter}
            testID={`amply.log.filter.${filter}`}
            accessibilityRole="button"
            accessibilityState={{selected: isOn}}
            accessibilityLabel={`${filter} log filter`}
            onPress={() => onSelect(filter)}
            style={[
              styles.filterChip,
              {backgroundColor: isOn ? filterColour(filter) : Theme.sunken},
            ]}>
            <Text style={[styles.filterText, {color: isOn ? '#ffffff' : Theme.secondaryLabel}]}>
              {filter}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The list itself: a plain column rather than a nested `FlatList`.
 *
 * A virtualised list inside the page's own scroll view hides rows from the accessibility tree —
 * which is what makes `amplySnapshot=log.filtered.event` verifiable rather than merely photogenic.
 * The window is bounded at `limit`, so the column is never long enough to need virtualising.
 */
export function LogList({
  rows,
  filter,
  limit,
  testID,
}: {
  rows: readonly LogRow[];
  filter: LogFilter;
  limit: number;
  testID: string;
}): React.JSX.Element {
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());

  const visible = useMemo(
    () => rows.filter(row => filterMatches(filter, row)).slice(0, limit),
    [filter, limit, rows],
  );

  const toggle = useCallback((id: number) => {
    setExpanded(previous => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  if (visible.length === 0) {
    return (
      <View testID={testID}>
        <Text style={styles.empty}>
          {filter === 'all' ? 'No rows yet.' : `No ${filter} rows in the last ${limit}.`}
        </Text>
      </View>
    );
  }

  return (
    <View testID={testID}>
      {visible.map((row, index) => (
        <View key={row.id}>
          {index > 0 ? <Separator /> : null}
          <LogRowView
            row={row}
            expanded={expanded.has(row.id)}
            attached={causeIsAdjacent(visible, index)}
            onToggle={toggle}
          />
        </View>
      ))}
    </View>
  );
}

/**
 * One log row — SAMPLE_APP_SPEC.md §5.1.
 *
 * ```
 * ⟨kind⟩  name                                        HH:mm:ss.SSS ▸
 *         key  value    key  value    key  value
 * ```
 *
 * The name takes the line and never truncates; the timestamp is right-aligned and quiet. It used
 * to sit first, in bright mono, and it cost the name its width — `CustomPropertyChanged` rendered
 * as `CustomPropertyChang…`, in a list whose whole job is to be scanned by name.
 */
function LogRowView({
  row,
  expanded,
  attached,
  onToggle,
}: {
  row: LogRow;
  expanded: boolean;
  /** Whether the row this one acknowledges is drawn immediately beside it. */
  attached: boolean;
  onToggle: (id: number) => void;
}): React.JSX.Element {
  const colour = rowColour(row);
  const canExpand = isExpandable(row);
  const isAck = row.acknowledges !== null;
  // The indent is only drawn when the cause is genuinely the next row. It is a claim about
  // position, and a claim about position that is not true is worse than no claim: three
  // acknowledgements in a row, each indented under the one above it, read as a hierarchy that does
  // not exist. Away from its cause the row stays flush and names it instead.
  const showsAsAttached = isAck && attached;

  const params: LogParam[] = isAck
    ? showsAsAttached
      ? []
      : [{key: 'for', value: row.acknowledges}]
    : row.params;

  return (
    <Pressable
      accessibilityRole={canExpand ? 'button' : 'text'}
      accessibilityLabel={`${row.kind} ${row.name}`}
      disabled={!canExpand}
      onPress={() => onToggle(row.id)}
      style={[styles.row, showsAsAttached ? styles.rowAttached : null]}>
      <View style={styles.header}>
        {showsAsAttached ? <Text style={styles.connector}>↳</Text> : null}
        <View style={[styles.kindPill, {backgroundColor: `${colour}2e`}]}>
          <Text style={[styles.kindText, {color: colour}]}>{row.kind}</Text>
        </View>
        {/* Never truncates. If it must, it wraps — the name is what the list is scanned for. */}
        <Text
          style={[
            styles.name,
            isAck ? styles.nameAck : null,
            row.severity === 'error' && !isAck ? {color: Theme.red} : null,
          ]}>
          {row.name}
        </Text>
        <Text style={styles.time}>{formatLogTime(row.timestamp)}</Text>
        {/* The caret appears only when there is something more to show. */}
        <Text style={styles.caret}>{canExpand ? (expanded ? '▾' : '▸') : ' '}</Text>
      </View>

      {params.length > 0 ? (
        <View style={styles.params}>
          {params.map((param, index) => (
            <ParamPair key={`${param.key}-${index}`} param={param} />
          ))}
        </View>
      ) : null}

      {canExpand && expanded ? (
        <View style={styles.payload}>
          <KeyValueTree data={row.payload} fontSize={11} />
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * One `key value` pair. The key is muted and one step smaller; the value is ink.
 *
 * The two sit close together — closer than one pair sits to the next — which is what makes
 * `coupon SUMMER10` read as a single unit instead of as two adjacent words. Only the VALUE
 * ellipsizes, and at its own end; the whole thing is on expand.
 */
function ParamPair({param}: {param: LogParam}): React.JSX.Element {
  return (
    <View style={styles.pair}>
      {param.key.length > 0 ? <Text style={styles.paramKey}>{param.key}</Text> : null}
      <Text
        numberOfLines={param.key.length > 0 ? 1 : 2}
        style={styles.paramValue}>
        {LogValue.render(param.value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Space.sm,
    rowGap: Space.sm,
    alignItems: 'center',
  },
  filterChip: {
    height: 30,
    borderRadius: 15,
    paddingHorizontal: Space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '500',
  },
  row: {
    paddingVertical: 8,
    gap: Space.xs,
  },
  rowAttached: {
    paddingLeft: 22,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  connector: {
    color: Theme.tertiaryLabel,
    fontSize: 13,
    marginLeft: -18,
  },
  kindPill: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  kindText: {
    fontSize: 10,
    fontWeight: '700',
  },
  name: {
    flex: 1,
    color: Theme.label,
    fontSize: 14,
    fontWeight: '600',
  },
  nameAck: {
    color: Theme.secondaryLabel,
    fontSize: 13,
    fontWeight: '500',
  },
  time: {
    color: Theme.tertiaryLabel,
    fontFamily: monoFamily,
    fontSize: 11,
  },
  caret: {
    color: Theme.tertiaryLabel,
    fontSize: 11,
    width: 10,
    textAlign: 'right',
  },
  params: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    // The gap BETWEEN pairs, deliberately larger than the gap inside one.
    columnGap: Space.lg,
    rowGap: Space.xs,
    alignItems: 'baseline',
  },
  pair: {
    flexDirection: 'row',
    alignItems: 'baseline',
    // The gap WITHIN a pair.
    gap: Space.xs,
    maxWidth: '100%',
    flexShrink: 1,
  },
  paramKey: {
    color: Theme.tertiaryLabel,
    fontSize: 11,
  },
  paramValue: {
    color: Theme.label,
    fontSize: 13,
    flexShrink: 1,
  },
  payload: {
    backgroundColor: Theme.sunken,
    borderRadius: 8,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
  },
  empty: {
    color: Theme.tertiaryLabel,
    fontSize: 13,
  },
});
