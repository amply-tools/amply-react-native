import React from 'react';
import {StyleSheet, View} from 'react-native';

import {Space, Theme} from '../theme';
import {ValueFormat, type JsonMap} from '../format';
import {Mono, Pill} from './primitives';

/**
 * An indented key/value tree — the one renderer for a dataset snapshot, an expanded log payload,
 * and the deeplink panel.
 *
 * Deliberately not a JSON blob in a scroll view. The question a snapshot answers is "is this key
 * present, and what type did it come back as", and braces and quotes are in the way of it. Keys
 * sort, so two runs of the same state read the same top to bottom.
 */
export function KeyValueTree({
  data,
  emptyText = 'empty',
  fontSize = 12,
  showsTypes = false,
  testID,
}: {
  data: JsonMap | null;
  emptyText?: string;
  fontSize?: number;
  showsTypes?: boolean;
  testID?: string;
}): React.JSX.Element {
  if (!data) {
    return <View testID={testID} />;
  }
  const keys = Object.keys(data);
  if (keys.length === 0) {
    return (
      <View testID={testID}>
        <Mono size={fontSize} color={Theme.tertiaryLabel}>
          {emptyText}
        </Mono>
      </View>
    );
  }
  return (
    <View testID={testID} style={styles.tree}>
      {renderMap(data, 0, fontSize, showsTypes)}
    </View>
  );
}

function renderMap(
  map: JsonMap,
  depth: number,
  fontSize: number,
  showsTypes: boolean,
): React.JSX.Element[] {
  const rows: React.JSX.Element[] = [];
  for (const key of Object.keys(map).sort()) {
    const value = map[key];
    const path = `${depth}.${key}`;
    if (Array.isArray(value)) {
      rows.push(
        <TreeRow key={path} label={key} note={`[${value.length}]`} depth={depth} fontSize={fontSize} />,
      );
      value.forEach((element, index) => {
        if (isMap(element)) {
          rows.push(
            <TreeRow
              key={`${path}.${index}`}
              label={String(index)}
              note={`{${Object.keys(element).length}}`}
              depth={depth + 1}
              fontSize={fontSize}
            />,
          );
          rows.push(...renderMap(element, depth + 2, fontSize, showsTypes));
        } else {
          rows.push(
            <TreeRow
              key={`${path}.${index}`}
              label={String(index)}
              value={element}
              depth={depth + 1}
              fontSize={fontSize}
              showsTypes={showsTypes}
            />,
          );
        }
      });
    } else if (isMap(value)) {
      rows.push(
        <TreeRow
          key={path}
          label={key}
          note={`{${Object.keys(value).length}}`}
          depth={depth}
          fontSize={fontSize}
        />,
      );
      rows.push(...renderMap(value, depth + 1, fontSize, showsTypes));
    } else {
      rows.push(
        <TreeRow
          key={path}
          label={key}
          value={value}
          depth={depth}
          fontSize={fontSize}
          showsTypes={showsTypes}
        />,
      );
    }
  }
  return rows;
}

function TreeRow({
  label,
  value,
  note,
  depth,
  fontSize,
  showsTypes,
}: {
  label: string;
  value?: unknown;
  note?: string;
  depth: number;
  fontSize: number;
  showsTypes?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.row, {paddingLeft: depth * 14}]}>
      <Mono size={fontSize} color={Theme.secondaryLabel}>
        {label}
      </Mono>
      <View style={styles.spacer} />
      {showsTypes && value !== undefined ? (
        <Pill text={ValueFormat.typeName(value)} colour={Theme.slate} />
      ) : null}
      {note ? (
        <Mono size={fontSize} color={Theme.tertiaryLabel}>
          {note}
        </Mono>
      ) : (
        <Mono size={fontSize} color={Theme.label} numberOfLines={1} style={styles.value}>
          {ValueFormat.describe(value)}
        </Mono>
      )}
    </View>
  );
}

function isMap(value: unknown): value is JsonMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const styles = StyleSheet.create({
  tree: {
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  spacer: {
    flex: 1,
    minWidth: Space.sm,
  },
  value: {
    flexShrink: 1,
    textAlign: 'right',
  },
});
