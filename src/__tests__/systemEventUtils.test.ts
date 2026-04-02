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
