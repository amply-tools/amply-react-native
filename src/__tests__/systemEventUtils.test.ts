import {formatSystemEventLabel} from '../systemEventUtils';
import type {EventRecord} from '../nativeSpecs/NativeAmplyModule';

function makeEvent(
  name: string,
  properties: Record<string, unknown> = {},
): EventRecord {
  return {name, type: 'system', timestamp: Date.now(), properties};
}

describe('formatSystemEventLabel', () => {
  describe('SessionStarted', () => {
    it('returns "Session started (cold)" for cold start', () => {
      const event = makeEvent('SessionStarted', {type: 'cold'});
      expect(formatSystemEventLabel(event)).toBe('Session started (cold)');
    });

    it('returns "Session started (warm)" for warm start', () => {
      const event = makeEvent('SessionStarted', {type: 'warm'});
      expect(formatSystemEventLabel(event)).toBe('Session started (warm)');
    });

    it('returns "Session started" when type is absent', () => {
      const event = makeEvent('SessionStarted');
      expect(formatSystemEventLabel(event)).toBe('Session started');
    });

    it('handles unexpected type values gracefully', () => {
      const event = makeEvent('SessionStarted', {type: 'unknown'});
      expect(formatSystemEventLabel(event)).toBe('Session started (unknown)');
    });
  });

  describe('DevicePropertyChanged', () => {
    it('names the property and shows a normalized version the way people write it', () => {
      const event = makeEvent('DevicePropertyChanged', {
        key: 'appVersionNormalized',
        oldValue: 100010003,
        newValue: 100020000,
      });
      expect(formatSystemEventLabel(event)).toBe(
        'Device property changed: appVersionNormalized 1.1.3 → 1.2.0',
      );
    });

    it('decodes versions with a zero major, as SDK versions have', () => {
      const event = makeEvent('DevicePropertyChanged', {
        key: 'sdkVersionNormalized',
        oldValue: 190000,
        newValue: 200000,
      });
      expect(formatSystemEventLabel(event)).toBe(
        'Device property changed: sdkVersionNormalized 0.19.0 → 0.20.0',
      );
    });

    it('shows other properties as sent', () => {
      const event = makeEvent('DevicePropertyChanged', {key: 'language', oldValue: 'en', newValue: 'de'});
      expect(formatSystemEventLabel(event)).toBe('Device property changed: language en → de');
    });

    it('falls back to the plain label without a key', () => {
      const event = makeEvent('DevicePropertyChanged');
      expect(formatSystemEventLabel(event)).toBe('Device property changed');
    });
  });

  describe('other events', () => {
    it('formats CampaignShown with campaignId and source', () => {
      const event = makeEvent('CampaignShown', {
        campaignId: 'abc',
        source: 'click',
      });
      expect(formatSystemEventLabel(event)).toBe(
        'Campaign shown (abc) via click',
      );
    });

    it('names the campaign in CampaignShown when the SDK sends campaignName', () => {
      const event = makeEvent('CampaignShown', {
        campaignId: 'abc',
        campaignName: 'Spring offer',
        source: 'click',
      });
      expect(formatSystemEventLabel(event)).toBe(
        'Campaign shown "Spring offer" (abc) via click',
      );
    });

    it('ignores an empty campaignName in CampaignShown', () => {
      const event = makeEvent('CampaignShown', {
        campaignId: 'abc',
        campaignName: '',
        source: 'click',
      });
      expect(formatSystemEventLabel(event)).toBe(
        'Campaign shown (abc) via click',
      );
    });

    it('formats EventTriggered with source event', () => {
      const event = makeEvent('EventTriggered', {sourceEvent: 'purchase'});
      expect(formatSystemEventLabel(event)).toBe('Event triggered (purchase)');
    });

    it('formats ConfigFetchFinished with campaign count', () => {
      const event = makeEvent('ConfigFetchFinished', {
        success: true,
        campaignCount: 3,
      });
      expect(formatSystemEventLabel(event)).toBe(
        'Config fetch finished (3 campaigns)',
      );
    });

    it('formats ConfigFetchFinished failure', () => {
      const event = makeEvent('ConfigFetchFinished', {success: false});
      expect(formatSystemEventLabel(event)).toBe('Config fetch failed');
    });

    it('returns default label for SessionFinished', () => {
      const event = makeEvent('SessionFinished');
      expect(formatSystemEventLabel(event)).toBe('Session finished');
    });

    it('returns fallback for unknown events', () => {
      const event = makeEvent('UnknownEvent');
      expect(formatSystemEventLabel(event)).toBe('System event UnknownEvent');
    });
  });
});
