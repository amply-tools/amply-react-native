import React, {useEffect, useMemo} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';

import {Space, Theme} from '../theme';
import {
  decisionColour,
  elapsedText,
  matchedText,
  type DecisionTraceEntry,
} from '../gateDemo';
import {useSample} from '../SampleProvider';
import {
  Caption,
  Card,
  KeyRow,
  Mono,
  SecondaryButton,
  SectionHeader,
  Separator,
} from '../ui/primitives';
import {KeyValueTree} from '../ui/KeyValueTree';
import {FakeAdOverlay} from '../ui/FakeAdOverlay';
import {useSnapshotTab} from './useSnapshotTab';

/**
 * Campaigns — what fired, what matched, what the SDK decided, and where a deeplink landed.
 *
 * **Why gated actions live here.** A gate only ever fires because a campaign carried a gate
 * action. The two buttons are not features of the app; they are the two shapes a campaign
 * decision can take — proceed-on-abort and cancel-on-abort. Filed anywhere else they read as an
 * unrelated ad-SDK demo.
 *
 * **Why there is no "trigger this campaign" button.** There is no such API on any surface.
 * Campaigns are selected server-side by matching a *tracked event* against targeting rules;
 * nothing in the RN TurboModule spec can address a campaign by id. The closest honest thing is
 * what this screen ships: fire the trigger event on the Events tab, read the loaded campaign list
 * here, and read the decision trace to see what happened.
 */
export function CampaignsScreen(): React.JSX.Element {
  const sample = useSample();
  const {gates} = sample;
  const {isTarget, reportFocus} = useSnapshotTab('campaigns');

  useEffect(() => {
    if (isTarget) {
      reportFocus();
    }
  }, [isTarget, reportFocus]);

  const deeplink = useMemo(() => {
    const record = sample.lastDeepLink;
    if (!record) {
      return null;
    }
    const named = ['url', 'campaignId', 'campaignName', 'triggeringEvent'];
    return {
      url: record.url,
      campaignId: String(record.info.campaignId ?? '—'),
      campaignName: String(record.info.campaignName ?? '—'),
      triggeringEvent: String(record.info.triggeringEvent ?? '—'),
      params: Object.fromEntries(
        Object.entries(record.info).filter(([key]) => !named.includes(key)),
      ),
    };
  }, [sample.lastDeepLink]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <SectionHeader title="Campaigns" />
          <Caption>Loaded campaigns</Caption>
          <View testID="amply.campaigns.list" style={styles.list}>
            {sample.campaigns.length === 0 ? (
              <Mono size={12} color={Theme.tertiaryLabel}>
                —   (no fetch has completed yet)
              </Mono>
            ) : (
              sample.campaigns.map(campaign => (
                <View key={campaign.id} style={styles.campaignRow}>
                  <Mono size={11} color={Theme.tertiaryLabel}>
                    {campaign.id}
                  </Mono>
                  <Text style={styles.campaignName}>{campaign.name}</Text>
                </View>
              ))
            )}
          </View>
          <SecondaryButton
            testID="amply.campaigns.refire"
            title="Refire last matched event"
            onPress={sample.refireLastMatched}
            disabled={sample.lastMatchedEvent === null}
            compact
          />
          <Separator />
          <Caption>Gated actions</Caption>
          <SecondaryButton
            testID="amply.campaigns.gate.level"
            title="Finish level  ·  interstitial"
            onPress={gates.finishLevel}
          />
          <SecondaryButton
            testID="amply.campaigns.gate.bonus"
            title="Claim bonus  ·  rewarded"
            onPress={gates.claimBonus}
          />
          {/* Present because a gate left registered behind a departed presenter parks the next
              gated call for its whole fail-open timeout, silently — the one failure mode you
              cannot see without a button that causes it. */}
          <SecondaryButton
            testID="amply.campaigns.gate.withdraw"
            title="Withdraw gates"
            onPress={gates.withdraw}
            tint={Theme.red}
            disabled={!gates.isRegistered}
            compact
          />
          <Text style={styles.note}>{`level ${gates.level} · ${gates.coins} coins`}</Text>
        </Card>

        <Card>
          <SectionHeader title="Decision trace" />
          <View testID="amply.campaigns.trace" style={styles.trace}>
            {gates.trace.length === 0 ? (
              <Text style={styles.empty}>No gated call yet.</Text>
            ) : (
              gates.trace.map((entry, index) => (
                <TraceEntry key={`${entry.event}-${index}`} entry={entry} />
              ))
            )}
          </View>
        </Card>

        {/* Rendered only after the SDK's deep link listener has fired. There is deliberately no
            standalone promo screen and no invented campaign content: a deeplink campaign has to
            land somewhere, and this panel is where it lands. */}
        {deeplink ? (
          <Card>
            <SectionHeader title="Deeplink" />
            <View testID="amply.deeplink.panel" style={styles.panel}>
              <KeyRow label="url" value={deeplink.url} keyWidth={104} />
              <KeyRow label="campaignId" value={deeplink.campaignId} keyWidth={104} />
              <KeyRow label="campaignName" value={deeplink.campaignName} keyWidth={104} />
              <KeyRow label="triggeringEvent" value={deeplink.triggeringEvent} keyWidth={104} />
              <Mono size={11} color={Theme.tertiaryLabel}>
                params
              </Mono>
              <View style={styles.params}>
                <KeyValueTree data={deeplink.params} emptyText="no extra params" fontSize={11} />
              </View>
            </View>
          </Card>
        ) : null}
      </ScrollView>

      <FakeAdOverlay request={gates.pendingAd} onOutcome={gates.reportAdOutcome} />
    </View>
  );
}

/**
 * One trace entry, field by field. The `decision` line is the one that makes the prose paragraph
 * every gate demo used to need unnecessary — and, unlike the paragraph, it is also right when a
 * campaign DID match and the presenter timed out.
 */
function TraceEntry({entry}: {entry: DecisionTraceEntry}): React.JSX.Element {
  return (
    <View style={styles.traceBox}>
      <KeyRow label="event" value={entry.event} keyWidth={72} lines={1} />
      <KeyRow
        label="matched"
        value={matchedText(entry)}
        keyWidth={72}
        colour={entry.matched ? Theme.label : Theme.tertiaryLabel}
      />
      {entry.action ? <KeyRow label="action" value={entry.action} keyWidth={72} /> : null}
      <KeyRow label="presenter" value={entry.presenter} keyWidth={72} />
      {entry.outcome ? <KeyRow label="outcome" value={entry.outcome} keyWidth={72} /> : null}
      <KeyRow
        label="decision"
        value={entry.decision}
        keyWidth={72}
        colour={decisionColour(entry)}
      />
      <KeyRow label="elapsed" value={elapsedText(entry)} keyWidth={72} lines={1} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: Space.lg,
    gap: Space.lg,
  },
  list: {
    gap: Space.xs,
  },
  campaignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  campaignName: {
    color: Theme.label,
    fontSize: 13,
    flex: 1,
  },
  trace: {
    gap: Space.sm,
  },
  traceBox: {
    backgroundColor: Theme.sunken,
    borderRadius: 8,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    gap: 2,
  },
  panel: {
    gap: Space.xs,
  },
  params: {
    paddingLeft: Space.md,
  },
  note: {
    color: Theme.tertiaryLabel,
    fontSize: 12,
  },
  empty: {
    color: Theme.tertiaryLabel,
    fontSize: 13,
  },
});
