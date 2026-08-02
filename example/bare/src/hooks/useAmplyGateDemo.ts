import {useCallback, useEffect, useRef, useState} from 'react';
import {Linking} from 'react-native';
import Amply from '@amply/amply-react-native';
import type {AdOutcome, FakeAdRequest} from '../components/FakeAdOverlay';

/**
 * The gate half of the demo: Amply decides WHETHER an interruption happens, the app runs it.
 *
 * This is the shape gates exist for — something long that Amply does not control and cannot
 * see inside. An ad is the clearest example: Amply knows the user finished a level and that a
 * campaign says "show an ad here", but the fill, the watch time and the outcome all belong to
 * the ad SDK. So `trackGated` hands the decision out and waits for one of three answers.
 *
 * Two gates rather than one, because the interesting difference is what a DISMISS means:
 *
 * - `amplyexample://ad/interstitial` — registered with `onAbort: 'proceed'`. Skipping an
 *   interstitial must not trap the user on the level-complete screen. Dismiss still proceeds.
 * - `amplyexample://ad/rewarded` — registered with `onAbort: 'cancel'`. The reward is the
 *   consideration for watching, so a dismiss has to cancel the bonus rather than grant it.
 *
 * That policy is a property of the gate, not of the presentation, which is why it is set at
 * registration and why one app can hold both at once.
 */
const INTERSTITIAL_GATE = 'amplysample://ad/interstitial';
const REWARDED_GATE = 'amplysample://ad/rewarded';

/** Used when the campaign's action URL does not carry an override. */
const DEFAULT_AD_SECONDS = 5;

/** Long enough for the campaign manifest to arrive before a scripted gated call. */
const AUTOGATE_DELAY_MS = 8000;

export type GateLogEntry = {
  id: string;
  line: string;
  at: Date;
};

type PendingPresentation = {
  request: FakeAdRequest;
  /** Reports the outcome back to Amply. Must be called exactly once. */
  report: (outcome: AdOutcome) => void;
};

/**
 * Drives a whole gate round trip without a tap, for scripted verification:
 *
 *   xcrun simctl openurl booted 'amplybare://autogate?action=bonus&outcome=watched'
 *   adb shell am start -a android.intent.action.VIEW -d 'amplybare://autogate?...'
 *
 * The presentation resolves itself once its countdown finishes. Consumed as it is used,
 * so it can never leak into a real presentation.
 */
export type AutoGateRequest = {action: 'bonus' | 'level'; outcome: AdOutcome};

function readNumber(params: Record<string, unknown>, key: string, fallback: number): number {
  const raw = params[key];
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readString(params: Record<string, unknown>, key: string, fallback: string): string {
  const raw = params[key];
  return typeof raw === 'string' && raw.length > 0 ? raw : fallback;
}

export const useAmplyGateDemo = (initialized: boolean) => {
  const [pending, setPending] = useState<PendingPresentation | null>(null);
  const [coins, setCoins] = useState(0);
  const [level, setLevel] = useState(1);
  const [gateLog, setGateLog] = useState<GateLogEntry[]>([]);
  const logCounter = useRef(0);
  /** Live withdrawal handles, so the UI can withdraw as well as the unmount path. */
  const withdrawalsRef = useRef<Array<() => void>>([]);
  /** Set by the autogate deep link; consumed by the next presentation. */
  const autoResolveRef = useRef<AdOutcome | null>(null);
  // The deep-link effect is declared before the callbacks it drives; refs bridge that
  // rather than reordering the file around a test affordance.
  const finishLevelRef = useRef<(() => void) | null>(null);
  const claimBonusRef = useRef<(() => void) | null>(null);

  const appendGateLog = useCallback((line: string) => {
    const at = new Date();
    const id = `${at.getTime()}-${logCounter.current++}`;
    setGateLog(previous => [{id, line, at}, ...previous].slice(0, 30));
    // Also to the console, so a scripted run can be read from the device log without a
    // screenshot. The simulator cannot be tapped from outside in this setup.
    console.log(`[gate] ${line}`);
  }, []);

  useEffect(() => {
    if (!initialized) {
      return;
    }

    let cancelled = false;

    /**
     * One presenter shape for both gates. It parses what the campaign's action URL carried,
     * shows the overlay, and translates the ad's outcome into the SDK's three answers.
     */
    const present =
      (format: FakeAdRequest['format']) =>
      (
        params: Record<string, unknown>,
        info: Record<string, unknown>,
        resolution: {completed: () => void; dismissed: () => void; unavailable: () => void},
      ) => {
        appendGateLog(
          `Gate present · ${format} · campaign="${String(info.campaignName ?? info.campaignId ?? '?')}"`,
        );

        const seconds = readNumber(params, 'seconds', DEFAULT_AD_SECONDS);
        const auto = autoResolveRef.current;
        autoResolveRef.current = null;

        const presentation: PendingPresentation = {
          request: {
            format,
            adUnit: readString(params, 'adUnit', `${format}_default`),
            seconds,
            reward: readString(params, 'reward', '50 coins'),
          },
          report: (outcome: AdOutcome) => {
            setPending(null);
            // completed / dismissed / unavailable is the whole vocabulary the SDK has. Anything
            // richer — watch time, eCPM, which network filled — stays on this side.
            if (outcome === 'watched') {
              appendGateLog('Reported: completed');
              resolution.completed();
            } else if (outcome === 'skipped') {
              appendGateLog('Reported: dismissed');
              resolution.dismissed();
            } else {
              appendGateLog('Reported: unavailable (no fill) → fails open');
              resolution.unavailable();
            }
          },
        };
        setPending(presentation);

        if (auto) {
          appendGateLog(`Auto-resolving this presentation as ${auto} in ${seconds}s`);
          setTimeout(() => presentation.report(auto), seconds * 1000 + 500);
        }
      };

    Promise.all([
      Amply.registerGate(INTERSTITIAL_GATE, present('interstitial'), {onAbort: 'proceed'}),
      Amply.registerGate(REWARDED_GATE, present('rewarded'), {onAbort: 'cancel'}),
    ])
      .then(unsubscribes => {
        if (cancelled) {
          unsubscribes.forEach(unsubscribe => unsubscribe());
          return;
        }
        withdrawalsRef.current.push(...unsubscribes);
        appendGateLog('Both gates registered');
      })
      .catch(error => appendGateLog(`Gate registration failed: ${String(error)}`));

    return () => {
      cancelled = true;
      // Withdraw on unmount. Without this the gate outlives the presenter and the next gated
      // call on that URL parks for the whole fail-open timeout — silently.
      withdrawalsRef.current.forEach(unsubscribe => unsubscribe());
      withdrawalsRef.current = [];
    };
  }, [appendGateLog, initialized]);

  const describeDecision = (decision: {outcome: string; reason?: string}): string =>
    decision.outcome === 'cancelled'
      ? 'cancelled'
      : `proceed (${decision.reason ?? 'unknown'})`;

  /** Interstitial: the level advances whatever the ad did. */
  const finishLevel = useCallback(async () => {
    appendGateLog(`trackGated("LevelFinished", level=${level})`);
    const decision = await Amply.trackGated('LevelFinished', {level});
    appendGateLog(`Decision: ${describeDecision(decision)}`);

    if (decision.outcome === 'proceed') {
      setLevel(current => current + 1);
      appendGateLog('App proceeded: next level');
    } else {
      appendGateLog('App held: still on this level');
    }
  }, [appendGateLog, level]);

  /** Rewarded: the bonus is granted only when the gate says proceed. */
  const claimBonus = useCallback(async () => {
    appendGateLog('trackGated("BonusRequested")');
    const decision = await Amply.trackGated('BonusRequested', {source: 'home'});
    appendGateLog(`Decision: ${describeDecision(decision)}`);

    if (decision.outcome === 'proceed') {
      setCoins(current => current + 50);
      appendGateLog('App proceeded: +50 coins');
    } else {
      appendGateLog('App held: no coins granted');
    }
  }, [appendGateLog]);

  /**
   * Drives the overlay WITHOUT going through the SDK, so the ad UI itself can be exercised on
   * a build that has no campaign behind it. Deliberately separate: it proves nothing about the
   * gate, and saying so is the point.
   */
  const previewAdUi = useCallback(
    (format: FakeAdRequest['format']) => {
      appendGateLog(`Preview only — not a gate decision (${format})`);
      setPending({
        request: {
          format,
          adUnit: `${format}_preview`,
          seconds: DEFAULT_AD_SECONDS,
          reward: '50 coins',
        },
        report: outcome => {
          setPending(null);
          appendGateLog(`Preview finished: ${outcome}`);
        },
      });
    },
    [appendGateLog],
  );

  /**
   * Withdraws both gates by hand. A screen would normally do this on unmount — it is exposed
   * here because withdrawal is the half of the lifecycle that fails invisibly: a gate left
   * behind a departed presenter parks the next gated call for its whole fail-open timeout,
   * with nothing in the console to say why.
   */
  const withdrawGates = useCallback(() => {
    withdrawalsRef.current.forEach(unsubscribe => unsubscribe());
    withdrawalsRef.current = [];
    appendGateLog('Both gates withdrawn — gated calls now fail open');
  }, [appendGateLog]);

  /**
   * Listens for the scripted-run deep link. Kept in this hook rather than the app's router
   * because it drives the gate demo and nothing else.
   */
  useEffect(() => {
    const run = (url: string | null) => {
      if (!url || !url.includes('autogate')) {
        return;
      }
      const query = url.split('?')[1] ?? '';
      const params = Object.fromEntries(
        query.split('&').map(pair => pair.split('=') as [string, string]),
      );
      const outcome = (
        {watched: 'watched', skipped: 'skipped', nofill: 'noFill'} as Record<string, AdOutcome>
      )[params.outcome ?? 'watched'];
      autoResolveRef.current = outcome ?? 'watched';
      appendGateLog(`autogate: ${params.action} → ${outcome ?? 'watched'} (in ${AUTOGATE_DELAY_MS}ms)`);
      // The manifest arrives a second or two after init, and a gated call made before it
      // lands cannot match anything — it fails open, correctly, and proves nothing. Waiting
      // is the difference between testing the gate and testing the fetch.
      setTimeout(() => {
        if (params.action === 'level') {
          finishLevelRef.current?.();
        } else {
          claimBonusRef.current?.();
        }
      }, AUTOGATE_DELAY_MS);
    };

    const subscription = Linking.addEventListener('url', ({url}) => run(url));
    Linking.getInitialURL().then(run);
    return () => subscription.remove();
  }, [appendGateLog]);

  finishLevelRef.current = finishLevel;
  claimBonusRef.current = claimBonus;

  return {
    withdrawGates,
    pendingAd: pending?.request ?? null,
    reportAdOutcome: (outcome: AdOutcome) => pending?.report(outcome),
    coins,
    level,
    gateLog,
    finishLevel,
    claimBonus,
    previewAdUi,
  };
};
