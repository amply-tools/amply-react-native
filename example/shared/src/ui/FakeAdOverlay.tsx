import React, {useEffect, useRef, useState} from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';

import {Space, Theme} from '../theme';
import type {AdOutcome, AdRequest} from '../gateDemo';

/**
 * A stand-in for a real ad SDK — the app's half of the `trackGated` contract.
 *
 * The point of a gate is that Amply decides WHETHER the interruption happens and the app runs it;
 * Amply never sees the ad network, the fill, or how long the user watched. So this component
 * deliberately knows nothing about Amply: it takes a format and a duration and reports one of
 * three outcomes. Swapping it for AdMob or AppLovin means replacing this file and nothing else.
 *
 * Not decoration, and not deletable: the SDK hands out a decision and waits for
 * `Completed` / `Dismissed` / `Unavailable`. Delete the presenter and there is no gate demo, only
 * a button that times out.
 */
export function FakeAdOverlay({
  request,
  onOutcome,
}: {
  request: AdRequest | null;
  onOutcome: (outcome: AdOutcome) => void;
}): React.JSX.Element | null {
  const [remaining, setRemaining] = useState(0);
  // Guards against a late timer tick reporting after the user already acted.
  const settledRef = useRef(false);

  useEffect(() => {
    if (!request) {
      return;
    }
    settledRef.current = false;
    setRemaining(request.seconds);

    const interval = setInterval(() => {
      setRemaining(previous => (previous <= 1 ? 0 : previous - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [request]);

  if (!request) {
    return null;
  }

  const finished = remaining === 0;
  const isRewarded = request.format === 'rewarded';

  const settle = (outcome: AdOutcome) => {
    if (settledRef.current) {
      return;
    }
    settledRef.current = true;
    onOutcome(outcome);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => settle('skipped')}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>
            {isRewarded ? 'REWARDED' : 'INTERSTITIAL'} · {request.adUnit}
          </Text>

          <View style={styles.creative}>
            <Text style={styles.creativeText}>Ad creative</Text>
            <Text style={styles.creativeSub}>
              {finished ? 'Finished' : `${remaining}s remaining`}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            style={[styles.primary, !finished && styles.primaryDisabled]}
            disabled={!finished}
            onPress={() => settle('watched')}>
            <Text style={styles.primaryText}>
              {isRewarded
                ? finished
                  ? `Claim ${request.reward}`
                  : 'Watch to the end to claim'
                : finished
                  ? 'Close'
                  : 'Close available soon'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            style={styles.secondary}
            onPress={() => settle('skipped')}>
            <Text style={styles.secondaryText}>
              {isRewarded ? 'Skip (forfeit the reward)' : 'Skip'}
            </Text>
          </Pressable>

          {/* A real mediation stack reports no-fill far more often than anyone expects, and it
              must not block the user. This button makes that path reachable by hand. */}
          <Pressable
            accessibilityRole="button"
            style={styles.tertiary}
            onPress={() => settle('noFill')}>
            <Text style={styles.tertiaryText}>Simulate no fill</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Space.xl,
  },
  card: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: Theme.card,
    padding: 20,
  },
  kicker: {
    color: Theme.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: Space.md,
  },
  creative: {
    height: 180,
    borderRadius: 12,
    backgroundColor: Theme.sunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.lg,
  },
  creativeText: {color: Theme.label, fontSize: 20, fontWeight: '600'},
  creativeSub: {color: Theme.secondaryLabel, fontSize: 14, marginTop: 6},
  primary: {
    borderRadius: 10,
    backgroundColor: Theme.accent,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryDisabled: {backgroundColor: Theme.sunken},
  primaryText: {color: '#ffffff', fontSize: 15, fontWeight: '600'},
  secondary: {paddingVertical: 12, alignItems: 'center'},
  secondaryText: {color: Theme.secondaryLabel, fontSize: 14},
  tertiary: {paddingVertical: 6, alignItems: 'center'},
  tertiaryText: {color: Theme.tertiaryLabel, fontSize: 12},
});
