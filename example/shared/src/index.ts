/**
 * The Amply sample app, once — mounted by `example/bare` and `example/expo` alike.
 *
 * What every control means is specified in ONE place, in the KMP repo:
 * `multiplatform-library-template/samples/SAMPLE_APP_SPEC.md`. Do not restate it here; two copies
 * drifting is the defect this module exists to cure.
 */
export {AmplySampleProvider, useSample} from './SampleProvider';
export type {SampleContextValue, SampleTargetConfig, SdkStatus} from './SampleProvider';

/** The whole shell: five tabs and everything on them. A host mounts this and nothing else. */
export {SampleTabs} from './SampleTabs';

export {SdkScreen} from './screens/SdkScreen';
export {EventsScreen} from './screens/EventsScreen';
export {CampaignsScreen} from './screens/CampaignsScreen';
export {InspectScreen} from './screens/InspectScreen';
export {LogScreen} from './screens/LogScreen';

export {
  READY_MARKER,
  SEED_KEY,
  SNAPSHOT_KEY,
  SNAPSHOT_SCREENS,
  TABS,
  readSnapshotRequest,
  targetFor,
} from './launchContract';
export type {SnapshotRequest, SnapshotScreen, TabId} from './launchContract';

export {LogValue} from './log';
export type {LogParam, LogRow} from './log';

export {Theme} from './theme';
export {FakeAdOverlay} from './ui/FakeAdOverlay';
