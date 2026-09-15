import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  EMPTY_CREDENTIALS,
  isPlaceholderCredential,
  optionalEndpoint,
  type StoredCredentials,
} from './sampleConfig';

/**
 * Credentials typed into the app, kept on the device.
 *
 * The second of the two doors onto the same guard. The first — the committed `sampleConfig.ts` each
 * example owns — stays for CI and for anyone who prefers a file; this one exists because a refusal
 * whose only way out is an edit-and-reload is a dead end. Someone opening the sample to see what the
 * SDK does was handed a broken app and a homework assignment (SAMPLE_APP_SPEC.md §5.5).
 *
 * What it deliberately does NOT do:
 * - weaken the guard. A stored value goes through the same {@link isPlaceholderCredential} test as a
 *   committed one, so typing `YOUR_API_KEY_PUBLIC` into the editor lifts nothing.
 * - write anything into the repository. `AsyncStorage` is per-installation state on the device;
 *   nothing here has a path inside the checkout.
 *
 * `AsyncStorage` because both examples already depend on it — the auto-initialize switch and the
 * Recent strip live there too. No new dependency for the one screen that must not need a rebuild.
 */
const KEYS = {
  apiKeyPublic: 'amply:credentials.apiKeyPublic',
  apiKeySecret: 'amply:credentials.apiKeySecret',
  configBaseUrl: 'amply:credentials.configBaseUrl',
  backendBaseUrl: 'amply:credentials.backendBaseUrl',
} as const;

export type CredentialField = keyof typeof KEYS;

export const CREDENTIAL_FIELDS: readonly CredentialField[] = [
  'apiKeyPublic',
  'apiKeySecret',
  'configBaseUrl',
  'backendBaseUrl',
];

/** The same filter the committed defaults get. A stored placeholder is not a credential. */
function keep(field: CredentialField, raw: string | null): string | null {
  const trimmed = (raw ?? '').trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (field === 'configBaseUrl' || field === 'backendBaseUrl') {
    return optionalEndpoint(trimmed);
  }
  return isPlaceholderCredential(trimmed) ? null : trimmed;
}

export async function loadCredentials(): Promise<StoredCredentials> {
  try {
    const pairs = await AsyncStorage.multiGet(CREDENTIAL_FIELDS.map(field => KEYS[field]));
    const byKey = new Map(pairs);
    return CREDENTIAL_FIELDS.reduce<StoredCredentials>(
      (result, field) => ({...result, [field]: keep(field, byKey.get(KEYS[field]) ?? null)}),
      {...EMPTY_CREDENTIALS},
    );
  } catch (error) {
    // A store this app cannot read is a store it has nothing in. The committed file then wins,
    // which is the same outcome as a fresh install rather than a broken screen.
    // eslint-disable-next-line no-console
    console.warn('[amply.sample] failed to read the stored credentials', error);
    return {...EMPTY_CREDENTIALS};
  }
}

/** Values are written verbatim; the placeholder filter runs on the way back out, as native does. */
export async function saveCredentials(values: Record<CredentialField, string>): Promise<void> {
  const writes: [string, string][] = [];
  const removals: string[] = [];
  for (const field of CREDENTIAL_FIELDS) {
    const trimmed = (values[field] ?? '').trim();
    if (trimmed.length === 0) {
      removals.push(KEYS[field]);
    } else {
      writes.push([KEYS[field], trimmed]);
    }
  }
  if (writes.length > 0) {
    await AsyncStorage.multiSet(writes);
  }
  if (removals.length > 0) {
    await AsyncStorage.multiRemove(removals);
  }
}

export async function clearCredentials(): Promise<void> {
  await AsyncStorage.multiRemove(CREDENTIAL_FIELDS.map(field => KEYS[field]));
}
