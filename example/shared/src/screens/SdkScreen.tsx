import React, {useEffect, useMemo, useState} from 'react';
import {Platform, ScrollView, StyleSheet, Switch, Text, View} from 'react-native';

import {Space, Theme} from '../theme';
import {endpointSummary, refusalNotice} from '../sampleConfig';
import {CREDENTIAL_FIELDS, type CredentialField} from '../sampleCredentials';
import {useSample} from '../SampleProvider';
import {
  Card,
  Mono,
  Pill,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
} from '../ui/primitives';
import {ParameterBuilder, emptyRow, type ParamRow} from '../ui/ParameterBuilder';
import {useSnapshotTab} from './useSnapshotTab';

const STATUS_COLOUR: Record<string, string> = {
  ready: Theme.green,
  initializing: Theme.orange,
  'not-initialized': Theme.grey,
  failed: Theme.red,
};

/** The four rows, in the order the editor shows them, with what each one is for. */
const CREDENTIAL_PLACEHOLDERS: Record<CredentialField, string> = {
  apiKeyPublic: 'public key',
  apiKeySecret: 'secret key',
  configBaseUrl: 'https://config-dev.amply.tools',
  backendBaseUrl: 'https://dev.amply.tools',
};

/**
 * SDK — is the SDK up, which backend is it talking to, and the way to give it credentials.
 *
 * The full identity block moved to Inspect (SAMPLE_APP_SPEC.md §5.5): it is the block a reader
 * copies into a bug report, and putting the credential and endpoint dump on the landing tab is what
 * §5.5 exists to correct. What stays here is the one line that answers "which environment is this
 * build talking to".
 */
export function SdkScreen({
  onOpenInspect,
}: {
  onOpenInspect: () => void;
}): React.JSX.Element {
  const sample = useSample();
  const {isTarget, reportFocus} = useSnapshotTab('sdk');
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    if (isTarget) {
      reportFocus();
    }
  }, [isTarget, reportFocus]);

  const statusColour = STATUS_COLOUR[sample.status] ?? Theme.grey;
  const refusing = !sample.isConfigurationUsable;
  // The line describes the runtime, not only the configuration (§5.5.1) — so a `ready` chip and a
  // "not initialised" sentence can no longer appear together.
  const notice = refusalNotice(sample.resolved, sample.status === 'ready');

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Card>
        <SectionHeader title="SDK" />
        <View style={styles.statusRow}>
          <Pill testID="amply.sdk.status" text={sample.status} colour={statusColour} />
          <View style={styles.spacer} />
          <Pill text={sample.config.channel} colour={Theme.slate} />
        </View>
        <View testID="amply.sdk.identity">
          <Mono size={12} color={Theme.secondaryLabel}>
            {`${sample.sdkVersion} · ${sample.config.appId} · ${Platform.OS}`}
          </Mono>
          <Mono size={12} color={Theme.secondaryLabel}>
            {`session: ${sample.sessionText}`}
          </Mono>
          {/* Which environment this build talks to. A campaign authored in one is invisible in the
              other, and the SDK cannot tell that from "no campaign matched" — both look like the
              gate quietly failing open. */}
          <Mono size={12} color={Theme.secondaryLabel}>
            {endpointSummary(sample.resolved)}
          </Mono>
        </View>

        {/* ONE line, with the way out directly under it (§5.5). It deliberately carries no
            manifest id — it is not a control. Amber rather than red once the SDK is already up:
            the same amber the datetime hint uses, not a fourth colour. */}
        {notice ? (
          <Text
            style={[
              styles.notice,
              {color: notice.tone === 'error' ? Theme.red : Theme.orange},
            ]}>
            {notice.text}
          </Text>
        ) : null}

        <CredentialsControl
          refusing={refusing}
          open={editorOpen}
          onToggle={() => setEditorOpen(open => !open)}
          onClose={() => setEditorOpen(false)}
        />

        {/* Rendered only while the status is not `ready`, so a healthy launch does not show a dead
            button. It also gives up the accent while the keys are placeholders: one filled button
            per card, and the action this card needs next is the one above it. Still tappable —
            tapping it writes the refusal into the log, which is the point. */}
        {sample.status !== 'ready' ? (
          refusing ? (
            <SecondaryButton
              testID="amply.sdk.initialize"
              title="Initialize"
              onPress={sample.initialize}
            />
          ) : (
            <PrimaryButton
              testID="amply.sdk.initialize"
              title="Initialize"
              onPress={sample.initialize}
            />
          )
        ) : null}

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Auto-initialize at launch</Text>
          <Switch
            testID="amply.sdk.autoinit"
            value={sample.autoInitialize}
            onValueChange={sample.setAutoInitialize}
            trackColor={{true: Theme.accent, false: Theme.sunken}}
          />
        </View>
        <SecondaryButton testID="amply.sdk.inspect" title="Inspect  ▸" onPress={onOpenInspect} />
      </Card>

      {/* Carries NO manifest id, deliberately: ATT is iOS-only and the React Native bridge exposes
          no binding for it, so the parity checker's `-` for those two rows is correct rather than a
          hole covered by a stub. */}
      <Card>
        <SectionHeader title="Permissions" />
        <Text style={styles.note}>
          Not applicable on this platform (ATT is iOS-only, and the React Native bridge exposes no
          binding for it).
        </Text>
      </Card>
    </ScrollView>
  );
}

/**
 * The primary action out of the refusal, and the way back in once keys are set — one control, one
 * id. A second "edit" button somewhere else would be two ways to do one thing.
 *
 * The editor is the SAME parameter builder the Events tab and Inspect use, with its switches turned
 * down: four fixed string rows, no type dropdown, no `[+]`, no `✕`. A second form doing the same
 * job is the drift this module exists to remove.
 */
function CredentialsControl({
  refusing,
  open,
  onToggle,
  onClose,
}: {
  refusing: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const sample = useSample();
  const stored = sample.storedCredentials;

  // Re-seeded whenever the stored values change (a save, or a clear), so the editor never shows a
  // value the store has already forgotten. Prefilled from what is stored on the DEVICE, not from
  // the resolved configuration: this editor owns the device half, and copying a committed secret
  // into it on every open would make "where did these keys come from" unanswerable a tap later.
  const seeded = useMemo<ParamRow[]>(
    () =>
      CREDENTIAL_FIELDS.map(field => ({
        ...emptyRow(),
        key: field,
        text: stored[field] ?? '',
      })),
    [stored],
  );
  const [rows, setRows] = useState<ParamRow[]>(seeded);
  useEffect(() => setRows(seeded), [seeded]);

  const OpenButton = refusing ? PrimaryButton : SecondaryButton;

  return (
    <>
      <OpenButton
        testID="amply.sdk.credentials"
        title={refusing ? 'Set API keys' : 'Edit API keys'}
        onPress={onToggle}
      />

      {open ? (
        <View testID="amply.sdk.credentials.editor" style={styles.editor}>
          <Text style={styles.note}>
            Stored on this device only — never written into the repository, and taking precedence
            over the keys this build was compiled with.
          </Text>
          <ParameterBuilder
            variant="credentials"
            rows={rows}
            onChange={setRows}
            editableKeys={false}
            types={['string']}
            showRemove={false}
            placeholders={CREDENTIAL_FIELDS.map(field => CREDENTIAL_PLACEHOLDERS[field])}
          />
          <Text style={styles.note}>
            Leave both URLs blank to use the SDK&apos;s built-in endpoints — which are PRODUCTION.
          </Text>
          {/* Saying it rather than pretending: the SDK reads its configuration once, at
              construction. */}
          {sample.status === 'ready' ? (
            <Text style={styles.caution}>
              The SDK is already running with the previous keys — relaunch the app for these to take
              effect.
            </Text>
          ) : null}
          <View style={styles.actions}>
            <PrimaryButton
              testID="amply.sdk.credentials.save"
              title="Save"
              compact
              style={styles.action}
              onPress={() => {
                const values = CREDENTIAL_FIELDS.reduce<Record<CredentialField, string>>(
                  (result, field) => ({
                    ...result,
                    [field]: rows.find(row => row.key === field)?.text ?? '',
                  }),
                  {} as Record<CredentialField, string>,
                );
                onClose();
                void sample.storeCredentials(values);
              }}
            />
            <SecondaryButton
              testID="amply.sdk.credentials.cancel"
              title="Cancel"
              compact
              style={styles.action}
              tint={Theme.secondaryLabel}
              onPress={() => {
                setRows(seeded);
                onClose();
              }}
            />
          </View>
          {/* The way back to the committed file. Without it, one mistyped key stored on the device
              would out-rank a correct build on every future launch, silently — the same dead end
              this whole change exists to remove, pointing the other way. */}
          {sample.hasStoredCredentials ? (
            <SecondaryButton
              testID="amply.sdk.credentials.clear"
              title="Clear stored keys"
              compact
              tint={Theme.red}
              onPress={() => {
                onClose();
                void sample.forgetCredentials();
              }}
            />
          ) : null}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Space.lg,
    gap: Space.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spacer: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  switchLabel: {
    flex: 1,
    color: Theme.label,
    fontSize: 14,
  },
  notice: {
    fontSize: 13,
  },
  editor: {
    gap: Space.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: Space.sm,
  },
  action: {
    flex: 1,
  },
  note: {
    color: Theme.tertiaryLabel,
    fontSize: 12,
  },
  caution: {
    color: Theme.orange,
    fontSize: 11,
  },
});
