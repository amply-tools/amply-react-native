import React, {useState} from 'react';
import {Modal, Pressable, StyleSheet, Switch, Text, TextInput, View} from 'react-native';

import {Space, Theme, monoFamily} from '../theme';
import type {JsonMap} from '../format';
import {SecondaryButton} from './primitives';

/**
 * The four types a value can be sent as. The type is **chosen, never guessed** — which is the
 * whole point of the builder, and why there is no parse-error path anywhere in it.
 *
 * `datetime` is here because a datetime reaches the SDK as **epoch milliseconds** and is therefore
 * indistinguishable on the wire from any other number. Backend type inference reports such a
 * property as `number`, and a test pins that behaviour. The app is the only place that knows which
 * one was meant, so it has to be the place that says so.
 */
export type ParamType = 'string' | 'number' | 'boolean' | 'datetime';

export const PARAM_TYPES: readonly ParamType[] = ['string', 'number', 'boolean', 'datetime'];

/**
 * Which manifest id family a row's controls carry.
 *
 * One component, two id families — and the two spellings are written out rather than assembled
 * from a prefix variable on purpose: the parity checker requires each id LITERAL to sit on the
 * same line as its `testID`, because that co-location is the only thing it can actually verify.
 * Building the ids out of a prop would defeat the check while looking tidier.
 */
export type ParamVariant = 'events' | 'props' | 'credentials';

export type ParamRow = {
  /** Stable across re-renders so a row keeps its keyboard focus while its neighbours change. */
  id: string;
  key: string;
  type: ParamType;
  /** The `string` and `number` value. */
  text: string;
  /** The `boolean` value. */
  flag: boolean;
  /** The `datetime` value, epoch millis. */
  millis: number;
};

let nextRowId = 0;

export function emptyRow(): ParamRow {
  return {
    id: `param-${++nextRowId}`,
    key: '',
    type: 'string',
    text: '',
    flag: true,
    millis: Date.now(),
  };
}

/** What a row will actually be handed to the SDK as. */
export function rowValue(row: ParamRow): string | number | boolean {
  switch (row.type) {
    case 'string':
      return row.text;
    case 'number': {
      const parsed = Number(row.text);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    case 'boolean':
      return row.flag;
    case 'datetime':
      return row.millis;
  }
}

/** Rows with a key, collapsed into the map `track` / `setCustomProperty` takes. */
export function rowsToProperties(rows: readonly ParamRow[]): JsonMap {
  const properties: JsonMap = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key.length > 0) {
      properties[key] = rowValue(row);
    }
  }
  return properties;
}

/**
 * Preset offsets for the `datetime` value control.
 *
 * React Native ships no date picker, and the only real one is a native module — a new native
 * dependency in the one example that gates every SDK release, and one that Expo prebuild would
 * have to be taught about too. These five cover what a datetime property is actually set for:
 * recency comparisons against `nowTs`. The resolved epoch millis is shown underneath, so what
 * reaches the SDK is never a mystery.
 */
const DATE_PRESETS: readonly {label: string; agoMs: number}[] = [
  {label: 'now', agoMs: 0},
  {label: '1h ago', agoMs: 60 * 60 * 1000},
  {label: '1d ago', agoMs: 24 * 60 * 60 * 1000},
  {label: '7d ago', agoMs: 7 * 24 * 60 * 60 * 1000},
  {label: '30d ago', agoMs: 30 * 24 * 60 * 60 * 1000},
];

type Props = {
  variant: ParamVariant;
  rows: readonly ParamRow[];
  onChange: (rows: ParamRow[]) => void;
  /**
   * The `[+]`. Omitted where the host renders its own — Inspect's `[+]` sits under a list of saved
   * properties, not under the editor, because there a row EXPANDS into this editor in place rather
   * than opening a second one.
   */
  add?: {testID: string; title: string};
  /**
   * Overrides what the row's `✕` does. Inspect passes one: there the icon already means "delete
   * this custom property", and an expanded row must not grow a second delete affordance that means
   * something narrower.
   */
  onRemove?: (index: number) => void;
  /**
   * Keys become captions rather than fields. The credentials editor (§5.5) has four FIXED rows —
   * `apiKeyPublic`, `apiKeySecret`, `configBaseUrl`, `backendBaseUrl` — and a key you can rename is
   * a key you can mistype into something the reader never notices is ignored.
   */
  editableKeys?: boolean;
  /**
   * The types on offer. One entry hides the dropdown entirely: a credential is a string, and a
   * control whose only option is the current one is furniture.
   */
  types?: readonly ParamType[];
  /** `✕` per row. The credentials editor has no per-row delete — `Clear stored keys` is the way out. */
  showRemove?: boolean;
  /** Per-row placeholder text, by index. */
  placeholders?: readonly string[];
};

/**
 * One parameter builder, used by BOTH event properties and custom properties — the same three
 * controls with the same four types, so it is built once. Two copies of a typed editor is exactly
 * the drift this wave exists to remove.
 */
export function ParameterBuilder({
  variant,
  rows,
  onChange,
  add,
  onRemove,
  editableKeys = true,
  types = PARAM_TYPES,
  showRemove = true,
  placeholders,
}: Props): React.JSX.Element {
  const update = (index: number, patch: Partial<ParamRow>) =>
    onChange(rows.map((row, position) => (position === index ? {...row, ...patch} : row)));

  const remove = (index: number) =>
    onRemove ? onRemove(index) : onChange(rows.filter((_, position) => position !== index));

  return (
    <View style={styles.builder}>
      {rows.map((row, index) => {
        const keyField = {
          accessibilityLabel: `Parameter ${index + 1} key`,
          value: row.key,
          onChangeText: (key: string) => update(index, {key}),
          placeholder: 'key',
          placeholderTextColor: Theme.tertiaryLabel,
          autoCapitalize: 'none' as const,
          autoCorrect: false,
          style: styles.keyField,
        };
        const removeButton = {
          accessibilityRole: 'button' as const,
          accessibilityLabel: `Remove parameter ${index + 1}`,
          hitSlop: 8,
          onPress: () => remove(index),
        };
        const typeButton = (
          <TypeDropdown variant={variant} row={row} index={index} onUpdate={update} />
        );
        const valueControl = (
          <ValueControl
            variant={variant}
            row={row}
            index={index}
            onUpdate={update}
            placeholder={placeholders?.[index]}
          />
        );

        return (
          <View key={row.id} style={styles.row}>
            <View style={styles.line}>
              {editableKeys ? (
                variant === 'events' ? (
                  <TextInput testID={`amply.events.properties.key.${index}`} {...keyField} />
                ) : variant === 'props' ? (
                  <TextInput testID={`amply.inspect.props.key.${index}`} {...keyField} />
                ) : (
                  <TextInput testID={`amply.sdk.credentials.key.${index}`} {...keyField} />
                )
              ) : variant === 'credentials' ? (
                <Text testID={`amply.sdk.credentials.key.${index}`} style={styles.keyCaption}>
                  {row.key}
                </Text>
              ) : (
                <Text style={styles.keyCaption}>{row.key}</Text>
              )}
              {types.length > 1 ? typeButton : null}
              {showRemove ? (
                variant === 'events' ? (
                  <Pressable testID={`amply.events.properties.remove.${index}`} {...removeButton}>
                    <Text style={styles.remove}>✕</Text>
                  </Pressable>
                ) : (
                  <Pressable testID={`amply.inspect.props.remove.${index}`} {...removeButton}>
                    <Text style={styles.remove}>✕</Text>
                  </Pressable>
                )
              ) : null}
            </View>

            {valueControl}
          </View>
        );
      })}

      {add ? (
        <SecondaryButton
          testID={add.testID}
          title={add.title}
          onPress={() => onChange([...rows, emptyRow()])}
          compact
        />
      ) : null}
    </View>
  );
}

/**
 * The type control. A dropdown rather than four always-visible chips: a row is `key · value ·
 * type · ✕` on one line, and four chips do not fit beside a key field on a phone. Closed it shows
 * the chosen type, which is the fact a reader is scanning the column for.
 */
function TypeDropdown({
  variant,
  row,
  index,
  onUpdate,
}: {
  variant: ParamVariant;
  row: ParamRow;
  index: number;
  onUpdate: (index: number, patch: Partial<ParamRow>) => void;
}): React.JSX.Element {
  const [isOpen, setOpen] = useState(false);
  const button = {
    accessibilityRole: 'button' as const,
    accessibilityLabel: `Parameter ${index + 1} type: ${row.type}`,
    accessibilityState: {expanded: isOpen},
    onPress: () => setOpen(open => !open),
    style: styles.typeButton,
  };
  const label = <Text style={styles.typeButtonText}>{`${row.type}  ▾`}</Text>;

  return (
    <View>
      {variant === 'events' ? (
        <Pressable testID={`amply.events.properties.type.${index}`} {...button}>
          {label}
        </Pressable>
      ) : (
        <Pressable testID={`amply.inspect.props.type.${index}`} {...button}>
          {label}
        </Pressable>
      )}
      {/* The open list is a modal, not a panel under the button. Anchored in flow it pushed the
          value control down the instant it opened — the row reflowed under the finger — and
          anchored as an overlay it was clipped by the bottom of the screen whenever the row sat
          low, which is exactly where a newly added row sits. A modal cannot be clipped and cannot
          move what is behind it. */}
      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.typeBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.typeMenu}>
            <Text style={styles.typeMenuTitle}>Value type</Text>
            {PARAM_TYPES.map(type => (
              <Pressable
                key={type}
                accessibilityRole="button"
                accessibilityState={{selected: type === row.type}}
                accessibilityLabel={`${type} type`}
                onPress={() => {
                  onUpdate(index, {type});
                  setOpen(false);
                }}
                style={[
                  styles.typeOption,
                  type === row.type ? {backgroundColor: Theme.accent} : null,
                ]}>
                <Text
                  style={[
                    styles.typeOptionText,
                    {color: type === row.type ? '#ffffff' : Theme.label},
                  ]}>
                  {type}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/**
 * The value control follows the type: text, a numeric keypad, a switch, or a date preset row.
 *
 * The `…value.<i>` id goes on the control ITSELF rather than a wrapper. A wrapper `<View>` is
 * pruned from the iOS accessibility tree, so a harness polling for the id found it only while the
 * row happened to be a lone text field and lost it the moment the type changed — measured with
 * `idb ui describe-all`.
 */
function ValueControl({
  variant,
  row,
  index,
  onUpdate,
  placeholder,
}: {
  variant: ParamVariant;
  row: ParamRow;
  index: number;
  onUpdate: (index: number, patch: Partial<ParamRow>) => void;
  placeholder?: string;
}): React.JSX.Element {
  if (row.type === 'boolean') {
    const toggle = {
      accessibilityLabel: `Parameter ${index + 1} value`,
      value: row.flag,
      onValueChange: (flag: boolean) => onUpdate(index, {flag}),
      trackColor: {true: Theme.accent, false: Theme.sunken},
    };
    return (
      <View style={styles.line}>
        <Text style={styles.valueLabel}>{row.flag ? 'true' : 'false'}</Text>
        <View style={styles.spacer} />
        {variant === 'events' ? (
          <Switch testID={`amply.events.properties.value.${index}`} {...toggle} />
        ) : variant === 'props' ? (
          <Switch testID={`amply.inspect.props.value.${index}`} {...toggle} />
        ) : (
          <Switch testID={`amply.sdk.credentials.value.${index}`} {...toggle} />
        )}
      </View>
    );
  }

  if (row.type === 'datetime') {
    const presets = (
      <View style={styles.presets}>
        {DATE_PRESETS.map(preset => (
          <Pressable
            key={preset.label}
            accessibilityRole="button"
            accessibilityLabel={preset.label}
            onPress={() => onUpdate(index, {millis: Date.now() - preset.agoMs})}
            style={styles.preset}>
            <Text style={styles.presetText}>{preset.label}</Text>
          </Pressable>
        ))}
      </View>
    );
    const resolved = (
      <>
        <Text style={styles.resolved}>
          {`${row.millis}  ·  ${new Date(row.millis).toISOString()}`}
        </Text>
        <Text style={styles.caveat}>
          sent as epoch millis — on the wire this is a number, and nothing downstream can tell it
          from one
        </Text>
      </>
    );
    return variant === 'credentials' ? (
      <View
        testID={`amply.sdk.credentials.value.${index}`}
        accessible
        accessibilityLabel={`Parameter ${index + 1} value`}
        style={styles.datetime}>
        {presets}
        {resolved}
      </View>
    ) : variant === 'events' ? (
      <View
        testID={`amply.events.properties.value.${index}`}
        accessible
        accessibilityLabel={`Parameter ${index + 1} value`}
        style={styles.datetime}>
        {presets}
        {resolved}
      </View>
    ) : (
      <View
        testID={`amply.inspect.props.value.${index}`}
        accessible
        accessibilityLabel={`Parameter ${index + 1} value`}
        style={styles.datetime}>
        {presets}
        {resolved}
      </View>
    );
  }

  const field = {
    accessibilityLabel: `Parameter ${index + 1} value`,
    value: row.text,
    onChangeText: (text: string) => onUpdate(index, {text}),
    placeholder: placeholder ?? (row.type === 'number' ? '0' : 'value'),
    placeholderTextColor: Theme.tertiaryLabel,
    keyboardType: row.type === 'number' ? ('numeric' as const) : ('default' as const),
    autoCapitalize: 'none' as const,
    autoCorrect: false,
    style: styles.valueField,
  };
  return variant === 'events' ? (
    <TextInput testID={`amply.events.properties.value.${index}`} {...field} />
  ) : variant === 'props' ? (
    <TextInput testID={`amply.inspect.props.value.${index}`} {...field} />
  ) : (
    <TextInput testID={`amply.sdk.credentials.value.${index}`} {...field} />
  );
}

const styles = StyleSheet.create({
  builder: {
    gap: Space.sm,
  },
  row: {
    backgroundColor: Theme.sunken,
    borderRadius: 10,
    padding: Space.sm,
    gap: Space.sm,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  spacer: {
    flex: 1,
  },
  /** A fixed key, rendered as the caption it is — the credentials editor's four rows are named. */
  keyCaption: {
    width: 116,
    color: Theme.secondaryLabel,
    fontFamily: monoFamily,
    fontSize: 12,
  },
  keyField: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    backgroundColor: Theme.card,
    color: Theme.label,
    paddingHorizontal: Space.sm,
    fontFamily: monoFamily,
    fontSize: 13,
  },
  valueField: {
    height: 36,
    borderRadius: 8,
    backgroundColor: Theme.card,
    color: Theme.label,
    paddingHorizontal: Space.sm,
    fontFamily: monoFamily,
    fontSize: 13,
  },
  valueLabel: {
    color: Theme.label,
    fontFamily: monoFamily,
    fontSize: 13,
  },
  remove: {
    color: Theme.tertiaryLabel,
    fontSize: 13,
    fontWeight: '700',
    width: 20,
    textAlign: 'right',
  },
  typeButton: {
    height: 36,
    minWidth: 104,
    borderRadius: 8,
    paddingHorizontal: Space.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.card,
  },
  typeButtonText: {
    color: Theme.accent,
    fontFamily: monoFamily,
    fontSize: 12,
    fontWeight: '600',
  },
  typeBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.xl,
  },
  typeMenu: {
    minWidth: 220,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Theme.card,
    paddingVertical: Space.sm,
  },
  typeMenuTitle: {
    color: Theme.secondaryLabel,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.2,
    paddingHorizontal: Space.md,
    paddingBottom: Space.sm,
  },
  typeOption: {
    paddingVertical: 12,
    paddingHorizontal: Space.md,
  },
  typeOptionText: {
    fontFamily: monoFamily,
    fontSize: 12,
  },
  datetime: {
    gap: 6,
  },
  presets: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  preset: {
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.card,
  },
  presetText: {
    color: Theme.secondaryLabel,
    fontSize: 11,
    fontWeight: '600',
  },
  resolved: {
    color: Theme.secondaryLabel,
    fontFamily: monoFamily,
    fontSize: 11,
  },
  caveat: {
    color: Theme.orange,
    fontSize: 11,
  },
});
