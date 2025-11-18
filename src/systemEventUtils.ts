import type {EventRecord} from './nativeSpecs/NativeAmplyModule';

const DEFAULT_LABELS: Record<string, string> = {
  SdkInitialized: 'SDK initialized',
  ConfigFetchStarted: 'Config fetch started',
  ConfigFetchFinished: 'Config fetch finished',
  SessionStarted: 'Session started',
  SessionFinished: 'Session finished',
  CampaignShown: 'Campaign shown',
  EventTriggered: 'Event triggered',
  CampaignStarted: 'Campaign processing started',
  CampaignFinished: 'Campaign finished',
};

export function formatSystemEventLabel(event: EventRecord): string {
  if (event.name === 'CampaignShown') {
    const campaignId = event.properties.campaignId as string | undefined;
    const source = event.properties.source as string | undefined;
    return `Campaign shown${campaignId ? ` (${campaignId})` : ''}${
      source ? ` via ${source}` : ''
    }`;
  }
  if (event.name === 'EventTriggered') {
    const source = event.properties.sourceEvent as string | undefined;
    return source ? `Event triggered (${source})` : DEFAULT_LABELS[event.name] ?? event.name;
  }
  if (event.name === 'ConfigFetchFinished') {
    const success = event.properties.success as boolean | undefined;
    const campaignCount = event.properties.campaignCount as number | undefined;
    const countLabel =
      typeof campaignCount === 'number' ? ` (${campaignCount} campaigns)` : '';
    return success === false ? 'Config fetch failed' : `Config fetch finished${countLabel}`;
  }
  return DEFAULT_LABELS[event.name] ?? `System event ${event.name}`;
}
