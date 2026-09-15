import {Platform} from 'react-native';

/**
 * One accent colour; one spacing scale; three control sizes.
 *
 * Colour carries meaning in exactly one place — the log kind chip and the decision line — so
 * everything else is greyscale on purpose. A sample that looks like a design showcase is a
 * sample whose one meaningful colour has to compete for attention.
 *
 * Fixed dark palette rather than the OS appearance: these screenshots are compared against the
 * iOS and Android samples, and a light/dark flip between two runs of the same screen is noise in
 * exactly the comparison the samples exist for.
 */
export const Theme = {
  /** The single accent. Matches `.systemBlue` / `Color.Blue` in the native samples. */
  accent: '#0a84ff',
  page: '#000000',
  card: '#1c1c1e',
  sunken: '#2c2c2e',
  separator: '#38383a',

  label: '#ffffff',
  secondaryLabel: '#98989f',
  tertiaryLabel: '#68686e',

  green: '#30d158',
  orange: '#ff9f0a',
  red: '#ff453a',
  purple: '#bf5af2',
  teal: '#40c8e0',
  blue: '#0a84ff',
  grey: '#8e8e93',
  slate: '#5b6273',
} as const;

export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const Size = {
  chipHeight: 30,
  buttonHeight: 44,
  fieldHeight: 44,
  cardRadius: 12,
} as const;

/**
 * The monospaced face. Identity lines, dataset trees and payloads are all read column-wise —
 * `level` lining up under `plan` is the difference between scanning and re-reading. The two
 * platforms name their own face; `monospace` does not exist on iOS and `Menlo` does not exist
 * on Android, and a missing family silently falls back to the proportional default.
 */
export const monoFamily = Platform.select({ios: 'Menlo', default: 'monospace'});
