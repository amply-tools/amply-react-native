import type {DataSetType} from '@amplytools/react-native-amply-sdk';

/**
 * All seven options SAMPLE_APP_SPEC.md §3 requires, including both `@triggeredEvent` count
 * strategies.
 *
 * `@custom` is here because it is the single largest coverage hole in the sample family:
 * `DataSetType.Custom` exists on all three platforms and no sample offered it, which is why
 * nobody could see their custom properties as the targeting engine sees them.
 */
export type DataSetOptionId =
  | 'device'
  | 'user'
  | 'custom'
  | 'session'
  | 'events'
  | 'triggeredEventGlobal'
  | 'triggeredEventSession';

export type DataSetOption = {
  id: DataSetOptionId;
  label: string;
  isTriggeredEvent: boolean;
};

export const DATASET_OPTIONS: readonly DataSetOption[] = [
  {id: 'device', label: '@device', isTriggeredEvent: false},
  {id: 'user', label: '@user', isTriggeredEvent: false},
  {id: 'custom', label: '@custom', isTriggeredEvent: false},
  {id: 'session', label: '@session', isTriggeredEvent: false},
  {id: 'events', label: '@events', isTriggeredEvent: false},
  {id: 'triggeredEventGlobal', label: '@triggeredEvent(global)', isTriggeredEvent: true},
  {id: 'triggeredEventSession', label: '@triggeredEvent(session)', isTriggeredEvent: true},
];

/**
 * The bridge takes a discriminated union rather than a string, so unlike the native samples
 * there is no `fromString` to go through. `@events` takes an empty declaration list, which is
 * exactly what `DataSetType.Events()` defaults to on the Kotlin side — the same dataset the
 * native samples read.
 */
export function dataSetTypeFor(option: DataSetOptionId, eventName: string): DataSetType {
  switch (option) {
    case 'device':
      return {kind: '@device'};
    case 'user':
      return {kind: '@user'};
    case 'custom':
      return {kind: '@custom'};
    case 'session':
      return {kind: '@session'};
    case 'events':
      return {kind: '@events', data: []};
    case 'triggeredEventGlobal':
      return {
        kind: '@triggeredEvent',
        data: {countStrategy: 'global', params: [], eventName: eventName || null},
      };
    case 'triggeredEventSession':
      return {
        kind: '@triggeredEvent',
        data: {countStrategy: 'session', params: [], eventName: eventName || null},
      };
  }
}

export function optionFor(id: DataSetOptionId): DataSetOption {
  const found = DATASET_OPTIONS.find(option => option.id === id);
  // Every id in the union has a row above; the fallback exists so the return type is not
  // optional at every call site.
  return found ?? DATASET_OPTIONS[0];
}
