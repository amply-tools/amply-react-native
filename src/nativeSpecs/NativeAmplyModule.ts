import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';
import type {EventEmitter} from 'react-native/Libraries/Types/CodegenTypes';

type JsonMap = {[key: string]: unknown};

/**
 * Log level for SDK debug output.
 * - 'none': No logging
 * - 'error': Only errors
 * - 'warn': Errors and warnings
 * - 'info': SDK lifecycle events (init, session start/end)
 * - 'debug': Everything including campaign evaluation details
 */
export type LogLevel = 'none' | 'error' | 'warn' | 'info' | 'debug';

export type AmplyInitializationConfig = {
  appId: string;
  apiKeyPublic: string;
  apiKeySecret?: string | null;
  /**
   * Base URL for the campaign manifest.
   *
   * The manifest and the event API are served from DIFFERENT hosts, so pointing
   * an app at a non-production stack takes both this and {@link backendBaseUrl}.
   * Setting only one leaves the other half of the traffic on production, which
   * is the failure this pair exists to make impossible to hit by accident.
   */
  configBaseUrl?: string | null;
  /** Base URL for session and event delivery. See {@link configBaseUrl}. */
  backendBaseUrl?: string | null;
  /**
   * @deprecated Older single-URL spelling of {@link backendBaseUrl}, kept so
   * existing callers keep working. It never covered the manifest host — prefer
   * naming both explicitly. Ignored when `backendBaseUrl` is also given.
   */
  endpoint?: string | null;
  defaultConfig?: string | null;
  /**
   * Enable debug logging. Shorthand for logLevel: 'debug'.
   * When true, logs will appear in the Metro console.
   */
  debug?: boolean | null;
  /**
   * Set the log level for SDK output.
   * Takes precedence over `debug` if both are specified.
   */
  logLevel?: LogLevel | null;
};

export type EventType = 'custom' | 'system';

export type TrackEventPayload = {
  name: string;
  properties?: JsonMap | null;
};

export type EventRecord = {
  id?: string | null;
  name: string;
  type: EventType;
  timestamp: number;
  properties: JsonMap;
};

export type SystemEventPayload = EventRecord;

export type TriggeredEventCountStrategy = 'global' | 'session';

export type TriggeredEventParam = {
  name: string;
  value: unknown;
};

export type TriggeredEventData = {
  countStrategy: TriggeredEventCountStrategy;
  params: TriggeredEventParam[];
  eventName?: string | null;
};

export type EventsDataSetEvent = {
  name: string;
  type: EventType;
  params: TriggeredEventParam[];
};

export type DataSetType =
  | {kind: '@device'}
  | {kind: '@user'}
  | {kind: '@custom'}
  | {kind: '@session'}
  | {kind: '@triggeredEvent'; data: TriggeredEventData}
  | {kind: '@events'; data: EventsDataSetEvent[]};

export type DataSetSnapshot = JsonMap;

export type DeepLinkEvent = {
  url: string;
  info: JsonMap;
  consumed: boolean;
};

/**
 * Terminal result reported by a gate presenter back to the SDK.
 *
 * - 'Completed': the presenter satisfied the gate condition (e.g. rewarded ad
 *   watched to completion). The gate proceeds with reason `completed`.
 * - 'Dismissed': a USER-INITIATED dismiss without satisfying the condition. With an
 *   `onAbort=cancel` gate this cancels; with `onAbort=proceed` it proceeds. Reserved
 *   strictly for user intent — never infra failures.
 * - 'Unavailable': any non-user failure (no-fill, failed-to-show, not-ready, missing
 *   precondition). Always fails open and proceeds with reason `failOpen`.
 *
 * NOTE: this raw result is intentionally NOT surfaced to app gating code — the public
 * `trackGated` surface only ever sees the collapsed {@link GateDecision}.
 */
export type CampaignResult = 'Completed' | 'Dismissed' | 'Unavailable';

/**
 * Bridge-level gate decision, mirroring the KMP `GateDecision`:
 * - `{ outcome: 'proceed', reason: 'completed' | 'failOpen' }` — the gate cleared.
 *   `completed` means the presenter satisfied the condition; `failOpen` means any
 *   infra/timeout/not-ready/dismiss-under-proceed path resolved permissively.
 * - `{ outcome: 'cancelled' }` — a deliberate user dismiss under an `onAbort=cancel`
 *   gate. The caller should suppress its follow-up action.
 *
 * The raw {@link CampaignResult} is never surfaced here; it is collapsed natively.
 */
export type GateDecision =
  | {outcome: 'proceed'; reason: 'completed' | 'failOpen'}
  | {outcome: 'cancelled'};

/**
 * Payload delivered to JS when a gate dispatches its (blocking) presentation.
 * The JS handler must eventually report a {@link CampaignResult} for `mediationId`
 * via `resolveCampaign`.
 */
export type CampaignPresentEvent = {
  url: string;
  /**
   * Parsed query parameters from the gate action URL — a flat string map decoded
   * from the URL query string (e.g. `{ adUnit: 'rewarded_main', placement: 'home' }`).
   */
  params: JsonMap;
  /**
   * Enriched, decoupled action info:
   * `{ url, campaignId, campaignName, triggeringEvent, triggeringProperties, content }`.
   */
  info: JsonMap;
  mediationId: string;
};

export interface Spec extends TurboModule {
  initialize(config: AmplyInitializationConfig): Promise<void>;
  isInitialized(): boolean;
  track(payload: TrackEventPayload): Promise<void>;
  /**
   * Gated form of track: records the event, evaluates campaigns, and — if a gate
   * action matches and a presenter is registered — dispatches the gate presentation
   * and awaits its outcome. Resolves with the collapsed {@link GateDecision} as a
   * plain map:
   * - `{ outcome: 'proceed', reason: 'completed' }` — gate satisfied.
   * - `{ outcome: 'proceed', reason: 'failOpen' }` — any permissive path (no gate,
   *   not initialized, timeout, unavailable, dismiss under `onAbort=proceed`, infra
   *   failure).
   * - `{ outcome: 'cancelled' }` — user dismiss under an `onAbort=cancel` gate.
   *
   * The raw {@link CampaignResult} is never returned to JS; it is collapsed natively.
   * This promise MUST NOT reject — every failure path resolves to a `proceed`/failOpen.
   */
  trackGated(event: string, properties: JsonMap): Promise<JsonMap>;
  /**
   * Report the terminal result of a gate presentation dispatched to JS via the
   * `onCampaignPresent` event. Idempotent natively — late/duplicate calls are ignored.
   * @param mediationId The id carried by the matching `onCampaignPresent` event.
   * @param result One of {@link CampaignResult} ('Completed' | 'Dismissed' | 'Unavailable').
   */
  resolveCampaign(mediationId: string, result: string): void;
  /**
   * Register the JS side as the recipient of gate presentation dispatches for the
   * given `baseUrl`. The native side wires the gate; JS receives each dispatch via
   * the `onCampaignPresent` event and replies through `resolveCampaign`.
   * @param baseUrl The gate action base URL this presenter handles.
   * @param onAbort Abort policy: 'cancel' (user dismiss cancels) or 'proceed'.
   * @param timeoutMs Max time the gate waits for a presenter result before failing open.
   */
  registerGate(baseUrl: string, onAbort: string, timeoutMs: number): void;
  /**
   * Withdraw the gate registered for `baseUrl`. A no-op when none is registered.
   *
   * Required for withdrawal to mean anything: the gate registry is process-scoped, so a gate
   * left registered by a presenter that has gone away parks the next gated call on that URL
   * for its whole fail-open timeout — with no crash, no error and no console trace.
   * @param baseUrl The gate action base URL passed to {@link registerGate}.
   */
  unregisterGate(baseUrl: string): void;
  getRecentEvents(limit: number): Promise<EventRecord[]>;
  getDataSetSnapshot(type: DataSetType): Promise<DataSetSnapshot>;
  registerDeepLinkListener(): void;
  /**
   * Set the user ID for analytics. Pass null to clear.
   * @param userId The user ID to set, or null to clear
   */
  setUserId(userId: string | null): void;
  /**
   * Set the log level at runtime.
   * @param level The log level to set
   */
  setLogLevel(level: string): void;
  /**
   * Get the current log level.
   * @returns The current log level as a string
   */
  getLogLevel(): string;
  /**
   * Set one or more custom properties. Values can be string, number, or boolean.
   * @param properties Key-value map of properties to set
   */
  setCustomProperties(properties: JsonMap): void;
  /**
   * Get a custom property value by key.
   * @param key The property key
   * @returns A map containing the value, or an empty map if not found
   */
  getCustomProperty(key: string): Promise<JsonMap>;
  /**
   * Remove a custom property by key.
   * @param key The property key to remove
   */
  removeCustomProperty(key: string): void;
  /**
   * Remove all custom properties.
   */
  clearCustomProperties(): void;
  readonly onSystemEvent: EventEmitter<SystemEventPayload>;
  readonly onDeepLink: EventEmitter<DeepLinkEvent>;
  readonly onCampaignPresent: EventEmitter<CampaignPresentEvent>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Amply');
