import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import {Size, Space, Theme, monoFamily} from '../theme';

/**
 * A grouped card. Every section on both screens is one of these, which is what makes a
 * screenshot of any two samples comparable top to bottom.
 */
export function Card({
  children,
  style,
  onLayout,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Passed straight through so a screen can record where its section sits, for §7 focus. */
  onLayout?: (event: LayoutChangeEvent) => void;
}): React.JSX.Element {
  return (
    <View style={[styles.card, style]} onLayout={onLayout}>
      {children}
    </View>
  );
}

export function SectionHeader({
  index,
  title,
}: {
  index?: string;
  title: string;
}): React.JSX.Element {
  return (
    <Text style={styles.sectionHeader}>
      {index ? `${index}  ` : ''}
      {title.toUpperCase()}
    </Text>
  );
}

export function Caption({children}: {children: React.ReactNode}): React.JSX.Element {
  return <Text style={styles.caption}>{children}</Text>;
}

export function Mono({
  children,
  size = 12,
  color = Theme.label,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}): React.JSX.Element {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{fontFamily: monoFamily, fontSize: size, color, lineHeight: size + 5}, style]}>
      {children}
    </Text>
  );
}

export function Pill({
  text,
  colour,
  testID,
}: {
  text: string;
  colour: string;
  testID?: string;
}): React.JSX.Element {
  return (
    <View testID={testID} style={[styles.pill, {backgroundColor: `${colour}2e`}]}>
      <Text style={[styles.pillText, {color: colour}]}>{text}</Text>
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  testID?: string;
  disabled?: boolean;
  tint?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Filled accent button — one per section at most. */
export function PrimaryButton({
  title,
  onPress,
  testID,
  disabled,
  compact,
  style,
}: ButtonProps): React.JSX.Element {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{disabled: !!disabled}}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        compact ? styles.buttonCompact : null,
        {backgroundColor: disabled ? Theme.sunken : Theme.accent},
        style,
      ]}>
      <Text style={[styles.buttonText, {color: disabled ? Theme.tertiaryLabel : '#ffffff'}]}>
        {title}
      </Text>
    </Pressable>
  );
}

export function SecondaryButton({
  title,
  onPress,
  testID,
  disabled,
  tint = Theme.accent,
  compact,
  style,
}: ButtonProps): React.JSX.Element {
  const colour = disabled ? Theme.tertiaryLabel : tint;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{disabled: !!disabled}}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        compact ? styles.buttonCompact : null,
        {backgroundColor: disabled ? Theme.sunken : `${tint}24`},
        style,
      ]}>
      <Text style={[styles.buttonText, {color: colour}]}>{title}</Text>
    </Pressable>
  );
}

export function Field({
  value,
  onChangeText,
  placeholder,
  testID,
  mono,
  style,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  testID?: string;
  mono?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <TextInput
      testID={testID}
      accessibilityLabel={placeholder}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={Theme.tertiaryLabel}
      autoCapitalize="none"
      autoCorrect={false}
      style={[styles.field, mono ? {fontFamily: monoFamily, fontSize: 13} : null, style]}
    />
  );
}

export function Separator(): React.JSX.Element {
  return <View style={styles.separator} />;
}

/** `key   value` on one baseline — identity lines, trace entries, the deeplink panel. */
export function KeyRow({
  label,
  value,
  keyWidth = 88,
  colour = Theme.label,
  lines = 3,
}: {
  label: string;
  value: string;
  keyWidth?: number;
  colour?: string;
  lines?: number;
}): React.JSX.Element {
  return (
    <View style={styles.keyRow}>
      <Mono size={11} color={Theme.tertiaryLabel} style={{width: keyWidth}}>
        {label}
      </Mono>
      <Mono size={12} color={colour} style={styles.keyRowValue} numberOfLines={lines}>
        {value}
      </Mono>
    </View>
  );
}

export function Chip({
  label,
  selected,
  colour,
  onPress,
  testID,
  mono,
}: {
  label: string;
  selected: boolean;
  colour: string;
  onPress: () => void;
  testID?: string;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{selected}}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, {backgroundColor: selected ? colour : Theme.sunken}]}>
      <Text
        style={[
          styles.chipText,
          mono ? {fontFamily: monoFamily, fontSize: 12} : null,
          {color: selected ? '#ffffff' : Theme.secondaryLabel},
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.card,
    borderRadius: Size.cardRadius,
    padding: Space.lg,
    gap: Space.md,
  },
  sectionHeader: {
    color: Theme.secondaryLabel,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.4,
  },
  caption: {
    color: Theme.secondaryLabel,
    fontSize: 12,
    fontWeight: '500',
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  button: {
    height: Size.buttonHeight,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.md,
  },
  buttonCompact: {
    height: 36,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  field: {
    flex: 1,
    height: Size.fieldHeight,
    borderRadius: 10,
    backgroundColor: Theme.sunken,
    color: Theme.label,
    paddingHorizontal: Space.md,
    fontSize: 15,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Theme.separator,
  },
  keyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Space.sm,
  },
  keyRowValue: {
    flex: 1,
  },
  chip: {
    height: Size.chipHeight,
    borderRadius: Size.chipHeight / 2,
    paddingHorizontal: Space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
