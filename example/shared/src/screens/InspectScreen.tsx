import React, {useCallback, useEffect, useState} from 'react';
import {Platform, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';

import {Space, Theme} from '../theme';
import {ValueFormat, couldBeEpochMillis, type JsonMap} from '../format';
import {DATASET_OPTIONS, optionFor, type DataSetOptionId} from '../datasets';
import {maskCredential} from '../sampleConfig';
import {useSample} from '../SampleProvider';
import {
  Card,
  Field,
  KeyRow,
  Mono,
  Pill,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  Separator,
} from '../ui/primitives';
import {KeyValueTree} from '../ui/KeyValueTree';
import {
  ParameterBuilder,
  emptyRow,
  rowValue,
  type ParamRow,
  type ParamType,
} from '../ui/ParameterBuilder';
import {useSectionScroll, useSnapshotTab} from './useSnapshotTab';

/** The SDK applies a property change asynchronously; read it back once it has landed. */
const READBACK_DELAY_MS = 300;

/**
 * Inspect — what the targeting engine actually sees.
 *
 * The dataset picker answers "what does a rule read", and the custom-properties list answers
 * "what did I actually set, and as what type". `@custom` is the single largest coverage hole in
 * the sample family: `DataSetType.Custom` exists on all three platforms and no sample offered it,
 * which is why nobody could see their custom properties as the engine sees them.
 */
export function InspectScreen(): React.JSX.Element {
  const sample = useSample();
  const {isTarget, target, reportFocus} = useSnapshotTab('inspect');
  const scroll = useSectionScroll(target?.scrollTo === 'properties' ? 'props' : null, isTarget);

  const [dataset, setDataset] = useState<DataSetOptionId>('device');
  const [triggerEvent, setTriggerEvent] = useState('CheckOffers');
  const [snapshot, setSnapshot] = useState<JsonMap | null>(null);
  const [snapshotFailed, setSnapshotFailed] = useState(false);
  const [customProperties, setCustomProperties] = useState<JsonMap>({});
  /**
   * The one row currently open in the editor, and which saved property it belongs to.
   * `editingKey === null` with a draft present means a brand-new property.
   */
  const [draft, setDraft] = useState<ParamRow | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const {readSnapshot} = sample;

  const reloadSnapshot = useCallback(
    async (option: DataSetOptionId) => {
      const result = await readSnapshot(option, triggerEvent.trim());
      setSnapshot(result);
      setSnapshotFailed(result === null);
      if (option === 'custom' && result) {
        setCustomProperties(result);
      }
    },
    [readSnapshot, triggerEvent],
  );

  const reloadCustomProperties = useCallback(async () => {
    const result = await readSnapshot('custom', '');
    setCustomProperties(result ?? {});
  }, [readSnapshot]);

  useEffect(() => {
    void reloadSnapshot(dataset);
    // `triggerEvent` deliberately does not re-read: the field is an input to the NEXT read, and
    // re-reading per keystroke would make the snapshot flicker while it is typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset]);

  // The SDK says a property changed; go and read it back rather than showing a list that quietly
  // disagrees with the log two cards below it. The @custom TREE has to be re-read too — showing
  // `@custom is empty` above a populated properties list is the same disagreement, one card up.
  useEffect(() => {
    void reloadCustomProperties();
    if (dataset === 'custom') {
      void reloadSnapshot('custom');
    }
    // `reloadSnapshot` closes over the trigger-event field, which must not re-read on every
    // keystroke; the identity that matters here is the version counter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, reloadCustomProperties, sample.customPropertiesVersion, sample.status]);

  // The launch contract names the dataset for `inspect.datasets.custom`; the focus is only
  // reported once that selection has been applied, so the marker never goes up over @device.
  useEffect(() => {
    if (!isTarget) {
      return;
    }
    if (target?.dataset === 'custom' && dataset !== 'custom') {
      setDataset('custom');
      return;
    }
    reportFocus();
  }, [dataset, isTarget, reportFocus, target]);

  const selected = optionFor(dataset);

  const readBack = useCallback(() => {
    setTimeout(() => {
      void reloadCustomProperties();
      if (dataset === 'custom') {
        void reloadSnapshot('custom');
      }
    }, READBACK_DELAY_MS);
  }, [dataset, reloadCustomProperties, reloadSnapshot]);

  const beginEdit = (key: string) => {
    const value = customProperties[key];
    const type = propertyType(value);
    setEditingKey(key);
    setDraft({
      ...emptyRow(),
      key,
      type,
      text: type === 'number' ? String(value) : String(value ?? ''),
      flag: value === true,
      millis: typeof value === 'number' ? value : Date.now(),
    });
  };

  const saveDraft = () => {
    if (!draft) {
      return;
    }
    const key = draft.key.trim();
    if (key.length === 0) {
      return;
    }
    // Renaming a property in place is a move, not an edit: the old key would otherwise survive
    // under its old value with nothing on screen saying so.
    if (editingKey && editingKey !== key) {
      sample.removeCustomProperty(editingKey);
    }
    sample.setCustomProperty(key, rowValue(draft));
    setDraft(null);
    setEditingKey(null);
    readBack();
  };

  const deleteProperty = (key: string) => {
    sample.removeCustomProperty(key);
    setDraft(null);
    setEditingKey(null);
    readBack();
  };

  const propertyKeys = Object.keys(customProperties).sort();

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scroll.scrollRef}
        onLayout={scroll.onScrollViewLayout}
        onContentSizeChange={scroll.onContentSizeChange}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}>
        {/* The block a reader copies into a bug report — which is why the credentials and the
            endpoints live HERE and not on the landing tab (SAMPLE_APP_SPEC.md §5.5). Both API keys
            are masked: a sample is the app most likely to end up in a screenshot. */}
        <Card>
          <SectionHeader title="Identity" />
          <View testID="amply.inspect.identity" style={styles.block}>
            <KeyRow label="sdkVersion" value={sample.sdkVersion} keyWidth={100} lines={1} />
            <KeyRow label="appId" value={sample.config.appId} keyWidth={100} lines={1} />
            <KeyRow label="platform" value={Platform.OS} keyWidth={100} lines={1} />
            <KeyRow label="channel" value={sample.config.channel} keyWidth={100} lines={1} />
            <KeyRow label="userId" value={sample.userId} keyWidth={100} lines={1} />
            <KeyRow label="session" value={sample.sessionText} keyWidth={100} lines={1} />
            <KeyRow label="logLevel" value={sample.logLevel} keyWidth={100} lines={1} />
            <KeyRow label="status" value={sample.status} keyWidth={100} lines={1} />
            <KeyRow
              label="config"
              value={sample.resolved.configBaseUrl ?? 'sdk default (PRODUCTION)'}
              keyWidth={100}
            />
            <KeyRow
              label="backend"
              value={sample.resolved.backendBaseUrl ?? 'sdk default (PRODUCTION)'}
              keyWidth={100}
            />
            <KeyRow
              label="apiKeyPublic"
              value={maskCredential(sample.resolved.apiKeyPublic)}
              keyWidth={100}
              lines={1}
            />
            <KeyRow
              label="apiKeySecret"
              value={maskCredential(sample.resolved.apiKeySecret)}
              keyWidth={100}
              lines={1}
            />
            {/* Which of the two doors these came through. "The file I just edited changed nothing"
                and "the key I typed last week is still winning" are otherwise the same screen. */}
            <KeyRow
              label="credentials"
              value={sample.credentialSource}
              keyWidth={100}
              lines={1}
            />
          </View>
        </Card>

        <Card>
          <SectionHeader title="Datasets" />
          <View testID="amply.inspect.dataset.picker" style={styles.pickerRow}>
            {DATASET_OPTIONS.map(option => {
              const isOn = option.id === dataset;
              const style = [
                styles.chip,
                {backgroundColor: isOn ? Theme.accent : Theme.sunken},
              ];
              const label = (
                <Text style={[styles.chipText, {color: isOn ? '#ffffff' : Theme.secondaryLabel}]}>
                  {option.label}
                </Text>
              );
              // `@custom` is called out by its own manifest id — it is the option the whole
              // section exists for.
              return option.id === 'custom' ? (
                <Pressable
                  key={option.id}
                  testID="amply.inspect.dataset.custom"
                  accessibilityRole="button"
                  accessibilityState={{selected: isOn}}
                  accessibilityLabel={option.label}
                  onPress={() => setDataset(option.id)}
                  style={style}>
                  {label}
                </Pressable>
              ) : (
                <Pressable
                  key={option.id}
                  testID={`amply.inspect.dataset.option.${option.label}`}
                  accessibilityRole="button"
                  accessibilityState={{selected: isOn}}
                  accessibilityLabel={option.label}
                  onPress={() => setDataset(option.id)}
                  style={style}>
                  {label}
                </Pressable>
              );
            })}
          </View>
          {selected.isTriggeredEvent ? (
            <View style={styles.row}>
              <Field
                value={triggerEvent}
                onChangeText={setTriggerEvent}
                placeholder="Event name for @triggeredEvent"
                mono
              />
            </View>
          ) : null}
          <View style={styles.row}>
            <SecondaryButton
              testID="amply.inspect.dataset.refresh"
              title="Refresh"
              onPress={() => void reloadSnapshot(dataset)}
              compact
              style={styles.halfAction}
            />
            {/* Fires the dataset's own event then re-reads. Enabled only for @triggeredEvent. */}
            <SecondaryButton
              testID="amply.inspect.dataset.trigger"
              title="Trigger & Refresh"
              onPress={() => {
                const name = triggerEvent.trim();
                if (name.length === 0) {
                  return;
                }
                void sample.track(name).then(() => {
                  setTimeout(() => void reloadSnapshot(dataset), READBACK_DELAY_MS);
                });
              }}
              disabled={!selected.isTriggeredEvent}
              compact
              style={styles.halfAction}
            />
          </View>
          <Separator />
          <KeyValueTree
            testID="amply.inspect.dataset.snapshot"
            data={snapshot ?? {}}
            emptyText={
              snapshotFailed
                ? 'getDataSetSnapshot returned nothing — is the SDK initialised?'
                : `${selected.label} is empty`
            }
          />
        </Card>

        <Card onLayout={scroll.registerSection('props')}>
          <SectionHeader title="Custom properties" />
          <Text style={styles.note}>
            Read back from getDataSetSnapshot(@custom) — the same view targeting has.
          </Text>
          {/* Unconditional, because both facts are things an integrator gets wrong once and then
              files as an SDK bug. */}
          <Text style={styles.note}>
            The type column is what Amply SEES. A datetime is stored as epoch milliseconds —
            indistinguishable from any other number on the wire — so it reads back as `number`.
            That is the wire, not a bug, which is why the type is picked by hand on the way in.
          </Text>
          <Text style={styles.note}>
            Values stay on this device: Amply stores the key and the inferred type, never the value,
            because a value may be personal data.
          </Text>
          <View testID="amply.inspect.props.list" style={styles.block}>
            {propertyKeys.length === 0 && !draft ? (
              <Text style={styles.empty}>No custom properties set.</Text>
            ) : null}
            {propertyKeys.map(key =>
              editingKey === key && draft ? (
                <PropertyEditorRow
                  key={key}
                  draft={draft}
                  onChange={setDraft}
                  onRemove={() => deleteProperty(key)}
                  onSave={saveDraft}
                />
              ) : (
                <View key={key}>
                  <View style={styles.propRow}>
                    {/* The row IS the editor's collapsed state — tapping it expands in place. */}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Edit ${key}`}
                      onPress={() => beginEdit(key)}
                      style={styles.propKey}>
                      <Mono size={13}>{key}</Mono>
                    </Pressable>
                    <Pill text={ValueFormat.typeName(customProperties[key])} colour={Theme.slate} />
                    <View style={styles.spacer} />
                    <Mono size={13} color={Theme.secondaryLabel} numberOfLines={1}>
                      {ValueFormat.describe(customProperties[key])}
                    </Mono>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${key}`}
                      hitSlop={8}
                      onPress={() => deleteProperty(key)}>
                      <Text style={styles.remove}>✕</Text>
                    </Pressable>
                  </View>
                  {couldBeEpochMillis(customProperties[key]) ? (
                    <Text style={styles.caveat}>could be a datetime — the wire cannot tell</Text>
                  ) : null}
                </View>
              ),
            )}
            {draft && editingKey === null ? (
              <PropertyEditorRow
                draft={draft}
                onChange={setDraft}
                onRemove={() => {
                  setDraft(null);
                  setEditingKey(null);
                }}
                onSave={saveDraft}
              />
            ) : null}
          </View>
          <View style={styles.row}>
            <PrimaryButton
              testID="amply.inspect.props.set"
              title="＋ Set property"
              onPress={() => {
                setEditingKey(null);
                setDraft(emptyRow());
              }}
              compact
              style={styles.halfAction}
            />
            <SecondaryButton
              testID="amply.inspect.props.clear"
              title={confirmClear ? 'Tap again to clear' : 'Clear all'}
              onPress={() => {
                if (!confirmClear) {
                  setConfirmClear(true);
                  return;
                }
                setConfirmClear(false);
                sample.clearCustomProperties();
                readBack();
              }}
              tint={Theme.red}
              compact
              style={styles.halfAction}
            />
          </View>
          {confirmClear ? (
            <Text style={styles.note}>
              clearCustomProperties() — this cannot be undone from the sample.
            </Text>
          ) : null}
        </Card>

        <View style={{height: scroll.bottomInset}} />
      </ScrollView>

    </View>
  );
}

/**
 * One expanded row: the SAME builder the Events tab uses, on the same sunken background the
 * collapsed row already had. No modal — a modal would be a second place to learn.
 */
function PropertyEditorRow({
  draft,
  onChange,
  onRemove,
  onSave,
}: {
  draft: ParamRow;
  onChange: (row: ParamRow) => void;
  onRemove: () => void;
  onSave: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.editor}>
      <ParameterBuilder
        variant="props"
        rows={[draft]}
        onChange={rows => rows[0] && onChange(rows[0])}
        onRemove={onRemove}
      />
      <PrimaryButton
        title="Save"
        onPress={onSave}
        disabled={draft.key.trim().length === 0}
        compact
      />
    </View>
  );
}

function propertyType(value: unknown): ParamType {
  if (typeof value === 'number') {
    return 'number';
  }
  if (typeof value === 'boolean') {
    return 'boolean';
  }
  return 'string';
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    padding: Space.lg,
    gap: Space.lg,
  },
  block: {
    gap: Space.xs,
  },
  row: {
    flexDirection: 'row',
    gap: Space.sm,
    alignItems: 'center',
  },
  halfAction: {
    flex: 1,
  },
  /**
   * Wraps rather than scrolling. The picker has to genuinely OFFER all seven datasets, and a chip
   * past the fold is not an offer — `@triggeredEvent(session)` was invisible, and `@events` was
   * sliced in half by the screen edge, which reads as a rendering fault. A control surface never
   * hides an option; only the Recent strip, which is history, may scroll.
   */
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Space.sm,
    rowGap: Space.sm,
    alignItems: 'center',
  },
  chip: {
    height: 30,
    borderRadius: 15,
    paddingHorizontal: Space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  propRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: 4,
  },
  propKey: {
    flexShrink: 1,
  },
  spacer: {
    flex: 1,
    minWidth: Space.sm,
  },
  remove: {
    color: Theme.tertiaryLabel,
    fontSize: 13,
    fontWeight: '700',
    width: 20,
    textAlign: 'right',
  },
  note: {
    color: Theme.secondaryLabel,
    fontSize: 12,
  },
  editor: {
    gap: Space.sm,
    paddingVertical: Space.xs,
  },
  caveat: {
    color: Theme.orange,
    fontSize: 11,
    paddingLeft: Space.sm,
    paddingBottom: Space.xs,
  },
  empty: {
    color: Theme.tertiaryLabel,
    fontSize: 13,
  },
});
