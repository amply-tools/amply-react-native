import React, {useEffect, useRef, useState} from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';

/**
 * A stand-in for a real ad SDK.
 *
 * The point of a gate is that Amply decides WHETHER the interruption happens and the app runs
 * it — Amply never sees the ad network, the fill, or how long the user watched. So this file
 * deliberately knows nothing about Amply: it takes a format and a duration, and reports one of
 * three outcomes. Swapping it for AdMob or AppLovin means replacing this component and nothing
 * else.
 */
export type AdFormat = 'interstitial' | 'rewarded';

export type AdOutcome = 'watched' | 'skipped' | 'noFill';

export type FakeAdRequest = {
  format: AdFormat;
  adUnit: string;
  seconds: number;
  /** Shown on the claim button of a rewarded ad, e.g. "50 coins". */
  reward?: string;
};

type Props = {
  request: FakeAdRequest | null;
  onOutcome: (outcome: AdOutcome) => void;
};

export function FakeAdOverlay({request, onOutcome}: Props): React.JSX.Element {
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
    return <></>;
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

          {isRewarded ? (
            <Pressable
              style={[styles.primary, !finished && styles.primaryDisabled]}
              disabled={!finished}
              onPress={() => settle('watched')}>
              <Text style={styles.primaryText}>
                {finished ? `Claim ${request.reward ?? 'reward'}` : 'Watch to the end to claim'}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.primary, !finished && styles.primaryDisabled]}
              disabled={!finished}
              onPress={() => settle('watched')}>
              <Text style={styles.primaryText}>{finished ? 'Close' : 'Close available soon'}</Text>
            </Pressable>
          )}

          <Pressable style={styles.secondary} onPress={() => settle('skipped')}>
            <Text style={styles.secondaryText}>
              {isRewarded ? 'Skip (forfeit the reward)' : 'Skip'}
            </Text>
          </Pressable>

          {/* A real mediation stack reports no-fill far more often than anyone expects, and it
              must not block the user. This button makes that path reachable by hand. */}
          <Pressable style={styles.tertiary} onPress={() => settle('noFill')}>
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
    padding: 24,
  },
  card: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#12131a',
    padding: 20,
  },
  kicker: {
    color: '#7fe3c4',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 12,
  },
  creative: {
    height: 200,
    borderRadius: 12,
    backgroundColor: '#22242f',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  creativeText: {color: '#f4f5f7', fontSize: 20, fontWeight: '600'},
  creativeSub: {color: '#9aa0ae', fontSize: 14, marginTop: 6},
  primary: {
    borderRadius: 10,
    backgroundColor: '#2f7d63',
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryDisabled: {backgroundColor: '#2a2c36'},
  primaryText: {color: '#ffffff', fontSize: 15, fontWeight: '600'},
  secondary: {paddingVertical: 12, alignItems: 'center'},
  secondaryText: {color: '#c3c8d4', fontSize: 14},
  tertiary: {paddingVertical: 6, alignItems: 'center'},
  tertiaryText: {color: '#6c7280', fontSize: 12},
});
