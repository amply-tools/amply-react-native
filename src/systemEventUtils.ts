import type {EventRecord} from './nativeSpecs/NativeAmplyModule';

const DEFAULT_LABELS: Record<string, string> = {
  SdkInitialized: 'SDK initialized',
  ConfigFetchStarted: 'Config fetch started',
  ConfigFetchFinished: 'Config fetch finished',
  SessionStarted: 'Session started',
  SessionFinished: 'Session finished',
  CampaignShown: 'Campaign shown',
  EventTriggered: 'Event triggered',
};

/** `@device` versions are major·10⁸ + minor·10⁴ + patch (1.2.0 = 100020000); shown decoded. */
const VERSION_SEGMENT = 10_000;

function displayDeviceValue(key: string, value: unknown): string {
  if (!key.endsWith('VersionNormalized') || typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return String(value);
  }
  const patch = value % VERSION_SEGMENT;
  const minor = Math.floor(value / VERSION_SEGMENT) % VERSION_SEGMENT;
  const major = Math.floor(value / (VERSION_SEGMENT * VERSION_SEGMENT));
  return `${major}.${minor}.${patch}`;
}

export interface FormatOptions {
  /** When true, includes detailed campaign information. Default: false */
  verbose?: boolean;
}

export function formatSystemEventLabel(
  event: EventRecord,
  options: FormatOptions = {},
): string {
  const {verbose = false} = options;

  if (event.name === 'SessionStarted') {
    const type = event.properties.type as string | undefined;
    return type ? `Session started (${type})` : 'Session started';
  }
  if (event.name === 'CampaignShown') {
    const campaignId = event.properties.campaignId as string | undefined;
    // Sent by SDK 0.15.0 and later (on CampaignShown and CampaignResolved alike).
    const campaignName = event.properties.campaignName as string | undefined;
    const source = event.properties.source as string | undefined;
    return `Campaign shown${campaignName ? ` "${campaignName}"` : ''}${campaignId ? ` (${campaignId})` : ''}${
      source ? ` via ${source}` : ''
    }`;
  }
  if (event.name === 'DevicePropertyChanged') {
    // Sent by Amply SDK 0.20.0 and later: one `@device` field (`appVersionNormalized`, …) changed.
    const key = event.properties.key as string | undefined;
    if (!key) {
      return 'Device property changed';
    }
    const show = (value: unknown) => displayDeviceValue(key, value);
    return `Device property changed: ${key} ${show(event.properties.oldValue)} → ${show(event.properties.newValue)}`;
  }
  if (event.name === 'EventTriggered') {
    const source = event.properties.sourceEvent as string | undefined;
    return source ? `Event triggered (${source})` : DEFAULT_LABELS[event.name] ?? event.name;
  }
  if (event.name === 'ConfigFetchFinished') {
    const success = event.properties.success as boolean | undefined;
    const campaignCount = event.properties.campaignCount as number | undefined;
    const campaigns = event.properties.campaigns as Array<{id: string; name: string}> | undefined;

    if (success === false) {
      return 'Config fetch failed';
    }

    const countLabel = typeof campaignCount === 'number' ? `${campaignCount}` : '0';

    if (verbose && campaigns && campaigns.length > 0) {
      const campaignLines = campaigns.map(c => `- [${c.id}] ${c.name}`).join('\n');
      return `Config fetch finished\nCampaigns: ${countLabel}\n${campaignLines}`;
    }

    return `Config fetch finished (${countLabel} campaigns)`;
  }
  return DEFAULT_LABELS[event.name] ?? `System event ${event.name}`;
}
