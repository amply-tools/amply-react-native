import type {SampleTargetConfig} from './SampleProvider';

/**
 * Where the React Native samples get their credentials and endpoints from, and the guard that stops
 * an unconfigured checkout talking to production.
 *
 * The committed values are placeholders and the SDK falls back to its **built-in production
 * endpoints**, so an unedited sample that initialised anyway posted a session production rejected —
 * and because a rejected session is never marked reported, the sweep re-sent it every ~10 s for the
 * life of the process. 543 `Missing API key` errors in production Sentry from one measured
 * afternoon, and the Expo example was still doing it on an emulator while the guard was written.
 *
 * The iOS twin is `SampleConfig.swift`; the Android one `SampleConfig.kt`. Same rules, same words.
 */

/**
 * A value that was never filled in. **Blank counts**: an unset key reaches the network exactly as
 * fast as a placeholder does, and a stored empty string is an unset value, not a credential.
 *
 * Matching the `YOUR_` shape rather than a list of two known strings means a placeholder renamed or
 * added later is still caught — the failure mode is someone adding a key and forgetting the guard,
 * not someone typing one of two exact strings.
 */
export function isPlaceholderCredential(value: string | null | undefined): boolean {
  const trimmed = (value ?? '').trim();
  return trimmed.length === 0 || trimmed.startsWith('YOUR_');
}

/** Placeholder or blank credentials must never reach a network call. */
export function isUsable(config: SampleTargetConfig): boolean {
  return (
    !isPlaceholderCredential(config.apiKeyPublic) && !isPlaceholderCredential(config.apiKeySecret)
  );
}

/** The cause on its own, so a log prefix does not say "not initialised" twice. */
export const REFUSAL_CAUSE =
  'the sample is still carrying placeholder API keys, so nothing is tracked and no campaign can show.';

/**
 * The ONE line the SDK tab renders while the keys are placeholders — SAMPLE_APP_SPEC.md §5.5.
 *
 * It names the cause and stops. What used to be here was four lines of red carrying a whole config
 * recipe under a seven-line dump. That is a homework assignment, not a refusal, and the way out is
 * now a button beside this line rather than a rebuild.
 */
export const REFUSAL_HEADLINE = `SDK not initialised — ${REFUSAL_CAUSE}`;

/**
 * The long form, for the console — where there is no button to press and the file route is what a
 * CI run needs to be told about. Both doors, named.
 */
export const REFUSAL_REASON =
  REFUSAL_CAUSE +
  " Enter a key pair in the app (SDK tab → Set API keys — stored on the device, never in the" +
  ' repository), or edit the placeholders in the example\'s own `src/sampleConfig.ts` and reload.';

/**
 * The amber line, for the one state the red one gets wrong — SAMPLE_APP_SPEC.md §5.5.1.
 *
 * Clear the stored keys while the SDK is RUNNING and the red line said "SDK not initialised" over
 * a green `ready` chip. Both facts were true — the SDK is up on the credentials it started with,
 * and the configuration is now unusable — but the sentence denied what the chip said, and a reader
 * cannot tell which to believe. All three platforms reached this screen independently, because all
 * three gated the line on the configuration alone.
 */
export const RUNNING_ON_CLEARED_CREDENTIALS =
  'Running on the credentials it started with. Those have been cleared, so the next launch will refuse.';

export type RefusalNotice = {
  text: string;
  /**
   * `error` is a refusal — nothing is being tracked. `warning` is not: the tracking on screen is
   * real, and what has changed is the NEXT launch, which is what the reader needs told.
   */
  tone: 'error' | 'warning';
};

/**
 * The line under the identity block, or nothing. It describes the **runtime**, so it takes both
 * inputs — the configuration and whether the SDK is actually up (§5.5.1).
 */
export function refusalNotice(
  config: SampleTargetConfig,
  sdkIsUp: boolean,
): RefusalNotice | null {
  if (isUsable(config)) {
    return null;
  }
  return sdkIsUp
    ? {text: RUNNING_ON_CLEARED_CREDENTIALS, tone: 'warning'}
    : {text: REFUSAL_HEADLINE, tone: 'error'};
}

/** Which of the two doors the resolved credentials came through. */
export type CredentialSource = 'entered in the app' | 'committed file' | 'placeholders — not set';

/**
 * Credentials typed into the app, already filtered: a blank or `YOUR_`-prefixed value is stored as
 * nothing, so a half-filled editor cannot produce a request to a host named `YOUR_BACKEND_BASE_URL`.
 */
export type StoredCredentials = {
  apiKeyPublic: string | null;
  apiKeySecret: string | null;
  configBaseUrl: string | null;
  backendBaseUrl: string | null;
};

export const EMPTY_CREDENTIALS: StoredCredentials = {
  apiKeyPublic: null,
  apiKeySecret: null,
  configBaseUrl: null,
  backendBaseUrl: null,
};

export function hasStoredCredentials(stored: StoredCredentials): boolean {
  return (
    stored.apiKeyPublic !== null ||
    stored.apiKeySecret !== null ||
    stored.configBaseUrl !== null ||
    stored.backendBaseUrl !== null
  );
}

/**
 * The stored overrides applied over the committed defaults.
 *
 * **Device before file**, deliberately: whoever just typed a key in the app is the most recent
 * instruction about which backend this build should talk to, and a stored value that lost to a
 * stale committed one would be a control that silently does nothing. `Clear stored keys` is the way
 * back.
 */
export function withStoredCredentials(
  config: SampleTargetConfig,
  stored: StoredCredentials,
): SampleTargetConfig {
  return {
    ...config,
    apiKeyPublic: stored.apiKeyPublic ?? config.apiKeyPublic,
    apiKeySecret: stored.apiKeySecret ?? config.apiKeySecret,
    configBaseUrl: stored.configBaseUrl ?? config.configBaseUrl ?? null,
    backendBaseUrl: stored.backendBaseUrl ?? config.backendBaseUrl ?? null,
  };
}

/**
 * Where the resolved keys actually came from, said in the identity block. Without it, "the file I
 * just edited changed nothing" and "the key I typed last week is still winning" are the same screen.
 */
export function credentialSource(
  config: SampleTargetConfig,
  stored: StoredCredentials,
): CredentialSource {
  if (stored.apiKeyPublic !== null || stored.apiKeySecret !== null) {
    return 'entered in the app';
  }
  return isUsable(config) ? 'committed file' : 'placeholders — not set';
}

/**
 * Enough leading characters to recognise a pair, the rest elided. A sample is the app most likely to
 * end up in a screenshot, and both halves are masked — the public key is not a credential on its
 * own, but a screenshot carrying it in full still names the project.
 *
 * Never more than half of a short value: masking that leaks most of what it masks is decoration.
 */
export function maskCredential(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (raw.length === 0) {
    return '<empty>';
  }
  if (isPlaceholderCredential(raw)) {
    return '<placeholder — not set>';
  }
  const lead = Math.min(8, Math.max(1, Math.floor(raw.length / 2)));
  return `${raw.slice(0, lead)}… (${raw.length} chars)`;
}

export const DEFAULT_CONFIG_ENDPOINT = '<default: https://config.amply.tools — PRODUCTION>';
export const DEFAULT_BACKEND_ENDPOINT = '<default: https://api.amply.tools — PRODUCTION>';

/** One short line for the SDK tab: which environment, not the whole block. */
export function endpointSummary(config: SampleTargetConfig): string {
  if (!config.configBaseUrl && !config.backendBaseUrl) {
    return 'endpoints: SDK defaults — PRODUCTION';
  }
  return `endpoints: ${config.backendBaseUrl ?? DEFAULT_BACKEND_ENDPOINT} · ${
    config.configBaseUrl ?? DEFAULT_CONFIG_ENDPOINT
  }`;
}

/**
 * A blank entry means "leave the SDK on its own defaults", and a half-filled one must not produce a
 * request to a host literally named `YOUR_BACKEND_BASE_URL` — so a placeholder base URL is treated
 * as unset rather than passed to the SDK.
 */
export function optionalEndpoint(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length === 0 || trimmed.startsWith('YOUR_') ? null : trimmed;
}
