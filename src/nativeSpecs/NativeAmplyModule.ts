import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';
import type {EventEmitter} from 'react-native/Libraries/Types/CodegenTypes';

type JsonMap = {[key: string]: unknown};

export type AmplyInitializationConfig = {
  appId: string;
  apiKeyPublic: string;
  apiKeySecret?: string | null;
  endpoint?: string | null;
  datasetPrefetch?: DataSetType[] | null;
  defaultConfig?: string | null;
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

export type TriggeredEventCountStrategy = 'total' | 'session' | 'user';

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
  | {kind: '@session'}
  | {kind: '@triggeredEvent'; data: TriggeredEventData}
  | {kind: '@events'; data: EventsDataSetEvent[]};

export type DataSetSnapshot = JsonMap;

export type DeepLinkEvent = {
  url: string;
  info: JsonMap;
  consumed: boolean;
};

export interface Spec extends TurboModule {
  initialize(config: AmplyInitializationConfig): Promise<void>;
  isInitialized(): boolean;
  track(payload: TrackEventPayload): Promise<void>;
  getRecentEvents(limit: number): Promise<EventRecord[]>;
  getDataSetSnapshot(type: DataSetType): Promise<DataSetSnapshot>;
  registerDeepLinkListener(): void;
  readonly onSystemEvent: EventEmitter<SystemEventPayload>;
  readonly onDeepLink: EventEmitter<DeepLinkEvent>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('Amply');
