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
 * Terminal result reported by a campaign presenter back to the SDK.
 *
 * - 'Completed': the presenter satisfied the campaign condition (e.g. rewarded ad
 *   watched to completion). The continuation proceeds.
 * - 'Dismissed': a USER-INITIATED dismiss without satisfying the condition. With an
 *   `onAbort=cancel` action this suppresses the continuation; with `onAbort=proceed`
 *   it proceeds. Reserved strictly for user intent — never infra failures.
 * - 'Unavailable': any non-user failure (no-fill, failed-to-show, not-ready, missing
 *   precondition). Always fails open and proceeds.
 *
 * NOTE: this raw result is intentionally NOT surfaced to app continuation code —
 * the public `trackEvent` continuation only ever sees `onProceed`/`onCancel`.
 */
export type CampaignResult = 'Completed' | 'Dismissed' | 'Unavailable';

/**
 * Payload delivered to JS when a campaign dispatches a present (blocking) action.
 * The JS handler must eventually report a {@link CampaignResult} for `mediationId`
 * via `resolveCampaign`.
 */
export type CampaignPresentEvent = {
  url: string;
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
   * Gated form of track: records the event, evaluates campaigns, and — if a
   * blocking action matches and a presenter is registered — dispatches the campaign
   * present and awaits its result. Resolves with the continuation decision:
   * - 'complete': the continuation should proceed (onProceed).
   * - 'cancel': the continuation should be suppressed (onCancel) — only ever
   *   returned for a user `Dismissed` against an `onAbort=cancel` action.
   *
   * The raw {@link CampaignResult} is never returned to JS; it is collapsed natively
   * into this 'complete' | 'cancel' decision so app code can't branch on results.
   * Every failure path fails open to 'complete'.
   */
  trackEventGated(event: string, properties: JsonMap): Promise<string>;
  /**
   * Report the terminal result of a campaign present dispatched to JS via the
   * `onCampaignPresent` event. Idempotent natively — late/duplicate calls are ignored.
   * @param mediationId The id carried by the matching `onCampaignPresent` event.
   * @param result One of {@link CampaignResult} ('Completed' | 'Dismissed' | 'Unavailable').
   */
  resolveCampaign(mediationId: string, result: string): void;
  /**
   * Register the JS side as the recipient of campaign present dispatches. Wiring of
   * the actual per-URL-pattern routing happens natively; JS receives every dispatch
   * via the `onCampaignPresent` event and replies through `resolveCampaign`.
   */
  registerCampaignPresenter(): void;
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
