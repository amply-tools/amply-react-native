import {useCallback, useEffect, useRef, useState} from 'react';
import Amply from '@amplytools/react-native-amply-sdk';
import type {GateDecision} from '@amplytools/react-native-amply-sdk';

import {ValueFormat, type JsonMap} from './format';
import {LogValue} from './log';
import type {LogAppend} from './log';
import type {RecentEvent} from './recentEvents';
import {
  DEFAULT_AD_SECONDS,
  GATE_TIMEOUT_MS,
  INTERSTITIAL_GATE,
  REWARDED_GATE,
  TRACE_DEPTH,
  traceOutcomeFor,
  type AdFormat,
  type AdOutcome,
  type AdRequest,
  type CampaignRef,
  type DecisionTraceEntry,
} from './gateDemo';

type PendingPresentation = {
  request: AdRequest;
  /** Reports the outcome back to Amply. Must be called exactly once. */
  report: (outcome: AdOutcome) => void;
};

export type GateApi = {
  isRegistered: boolean;
  trace: readonly DecisionTraceEntry[];
  level: number;
  coins: number;
  pendingAd: AdRequest | null;
  reportAdOutcome: (outcome: AdOutcome) => void;
  finishLevel: () => void;
  claimBonus: () => void;
  withdraw: () => void;
  /** One full round trip with the presenter reporting Completed — used by `amplySeed`. */
  runSeededRound: () => void;
};

type Options = {
  isReady: boolean;
  appendLog: (entry: LogAppend) => void;
  noteMatchedEvent: (event: RecentEvent) => void;
};

function readNumber(params: JsonMap, key: string, fallback: number): number {
  const raw = params[key];
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readString(params: JsonMap, key: string, fallback: string): string {
  const raw = params[key];
  return typeof raw === 'string' && raw.length > 0 ? raw : fallback;
}

function describeDecision(decision: GateDecision): string {
  if (decision.outcome === 'cancelled') {
    return 'cancelled';
  }
  return `proceed(${decision.reason})`;
}

/**
 * Owns the two gate registrations, runs the gated calls, and turns each one into a structured
 * decision trace entry (SAMPLE_APP_SPEC.md §4).
 *
 * Separate from the screens because the registrations outlive any one view: the gate registry is
 * process-scoped, so a gate left behind by a torn-down host parks the next gated call on that URL
 * for the whole fail-open timeout, with no crash and nothing in the console. That is the failure
 * `amply.campaigns.gate.withdraw` exists to let you cause on purpose.
 */
export function useGateController({isReady, appendLog, noteMatchedEvent}: Options): GateApi {
  const [pending, setPending] = useState<PendingPresentation | null>(null);
  const [trace, setTrace] = useState<readonly DecisionTraceEntry[]>([]);
  const [level, setLevel] = useState(1);
  const [coins, setCoins] = useState(0);
  const [isRegistered, setRegistered] = useState(false);

  const withdrawalsRef = useRef<Array<() => void>>([]);
  const autoResolveRef = useRef<AdOutcome | null>(null);

  // One gated call at a time is the only shape the UI can produce, so the in-flight facts live
  // in refs rather than being threaded through the presenter callback.
  const inFlightMatched = useRef<CampaignRef | null>(null);
  const inFlightAction = useRef<string | null>(null);
  const inFlightOutcome = useRef<string | null>(null);
  const inFlightPresenter = useRef('none → fail-open');

  const levelRef = useRef(level);
  levelRef.current = level;

  useEffect(() => {
    if (!isReady) {
      return;
    }
    let cancelled = false;

    /**
     * One presenter shape for both gates. It parses what the campaign's action URL carried, shows
     * the overlay, and translates the ad's outcome into the SDK's three answers.
     */
    const present =
      (format: AdFormat) =>
      (
        params: Record<string, unknown>,
        info: Record<string, unknown>,
        resolution: {completed: () => void; dismissed: () => void; unavailable: () => void},
      ) => {
        inFlightPresenter.current = `registered (onAbort = ${
          format === 'rewarded' ? 'cancel' : 'proceed'
        })`;
        inFlightAction.current = typeof info.url === 'string' ? info.url : null;
        if (typeof info.campaignId === 'string') {
          inFlightMatched.current = {
            id: info.campaignId,
            name: typeof info.campaignName === 'string' ? info.campaignName : '(unnamed)',
          };
        }

        const seconds = readNumber(params as JsonMap, 'seconds', DEFAULT_AD_SECONDS);
        const request: AdRequest = {
          format,
          adUnit: readString(params as JsonMap, 'adUnit', `${format}_default`),
          seconds,
          reward: readString(params as JsonMap, 'reward', '50 coins'),
        };

        appendLog({
          kind: 'gate',
          name: 'gate.present',
          params: [
            {key: 'format', value: format},
            {key: 'adUnit', value: request.adUnit},
            {key: 'seconds', value: request.seconds},
          ],
          payload: info as JsonMap,
        });

        const presentation: PendingPresentation = {
          request,
          report: (outcome: AdOutcome) => {
            setPending(null);
            inFlightOutcome.current = traceOutcomeFor(outcome);
            // completed / dismissed / unavailable is the whole vocabulary the SDK has. Anything
            // richer — watch time, eCPM, which network filled — stays on this side.
            if (outcome === 'watched') {
              appendLog({kind: 'gate', name: 'gate.report', params: [{key: 'resolve', value: 'Completed'}]});
              resolution.completed();
            } else if (outcome === 'skipped') {
              appendLog({kind: 'gate', name: 'gate.report', params: [{key: 'resolve', value: 'Dismissed'}]});
              resolution.dismissed();
            } else {
              appendLog({
                kind: 'gate',
                name: 'gate.report',
                params: [
                  {key: 'resolve', value: 'Unavailable'},
                  {key: '', value: 'no fill — fails open'},
                ],
              });
              resolution.unavailable();
            }
          },
        };
        setPending(presentation);

        const auto = autoResolveRef.current;
        autoResolveRef.current = null;
        if (auto) {
          appendLog({
            kind: 'gate',
            name: 'gate.autoresolve',
            params: [
              {key: 'outcome', value: auto},
              {key: 'in', value: `${request.seconds}s`},
            ],
          });
          setTimeout(() => presentation.report(auto), request.seconds * 1000 + 500);
        }
      };

    Promise.all([
      Amply.registerGate(INTERSTITIAL_GATE, present('interstitial'), {
        onAbort: 'proceed',
        timeoutMs: GATE_TIMEOUT_MS,
      }),
      Amply.registerGate(REWARDED_GATE, present('rewarded'), {
        onAbort: 'cancel',
        timeoutMs: GATE_TIMEOUT_MS,
      }),
    ])
      .then(unsubscribes => {
        if (cancelled) {
          unsubscribes.forEach(unsubscribe => unsubscribe());
          return;
        }
        withdrawalsRef.current.push(...unsubscribes);
        setRegistered(true);
        appendLog({
          kind: 'gate',
          name: 'gate.register',
          params: [
            {key: 'gates', value: 2},
            {key: 'timeout', value: `${GATE_TIMEOUT_MS / 1000}s`},
          ],
          payload: {interstitial: INTERSTITIAL_GATE, rewarded: REWARDED_GATE},
        });
      })
      .catch((error: unknown) =>
        appendLog({
          kind: 'gate',
          name: 'gate.register',
          note: ValueFormat.oneLine(`registration failed: ${String(error)}`),
          severity: 'error',
        }),
      );

    return () => {
      cancelled = true;
      // Withdraw on unmount. Without this the gate outlives the presenter and the next gated
      // call on that URL parks for the whole fail-open timeout — silently.
      withdrawalsRef.current.forEach(unsubscribe => unsubscribe());
      withdrawalsRef.current = [];
      setRegistered(false);
    };
  }, [appendLog, isReady]);

  const record = useCallback(
    (event: string, properties: JsonMap, decision: string, elapsedMs: number) => {
      const entry: DecisionTraceEntry = {
        event,
        matched: inFlightMatched.current,
        action: inFlightAction.current,
        presenter: inFlightPresenter.current,
        outcome: inFlightOutcome.current,
        decision,
        elapsedMs,
      };
      setTrace(previous => [entry, ...previous].slice(0, TRACE_DEPTH));

      if (entry.matched) {
        noteMatchedEvent({name: event, properties});
      }

      // The trace entry IS a log row — same facts, one place they are recorded.
      appendLog({
        kind: 'gate',
        name: 'gate.decision',
        params: [
          {key: 'event', value: event},
          {key: 'decision', value: decision},
          {key: 'elapsed', value: `${(elapsedMs / 1000).toFixed(1)}s`},
        ],
        payload: {
          event,
          matched: entry.matched ? `${entry.matched.name} (${entry.matched.id})` : '—',
          presenter: entry.presenter,
          decision,
          elapsed: `${(elapsedMs / 1000).toFixed(1)}s`,
          ...(entry.action ? {action: entry.action} : {}),
          ...(entry.outcome ? {outcome: entry.outcome} : {}),
        },
        severity: decision.startsWith('cancelled') ? 'warn' : 'info',
      });
    },
    [appendLog, noteMatchedEvent],
  );

  const run = useCallback(
    async (event: string, properties: JsonMap, apply: (decision: GateDecision) => void) => {
      inFlightMatched.current = null;
      inFlightAction.current = null;
      inFlightOutcome.current = null;
      inFlightPresenter.current =
        withdrawalsRef.current.length === 0 ? 'none → fail-open' : 'registered';

      const started = Date.now();
      appendLog({
        kind: 'gate',
        name: 'trackGated',
        params: [{key: 'event', value: event}, ...LogValue.paramsFrom(properties, started)],
        payload: properties,
      });

      const decision = await Amply.trackGated(event, properties);
      apply(decision);

      /**
       * `proceed(failOpen · no campaign)` rather than a bare `proceed(failOpen)` when nothing
       * matched. The distinction is the whole point of the line: an immediate proceed with no
       * campaign behind it is correct, and an immediate proceed WITH a campaign behind it is a
       * presenter that never reported.
       */
      const described = describeDecision(decision);
      const text =
        described === 'proceed(failOpen)' && inFlightMatched.current === null
          ? 'proceed(failOpen · no campaign)'
          : described;

      record(event, properties, text, Date.now() - started);
    },
    [appendLog, record],
  );

  /** Interstitial: the level advances whatever the ad did (`onAbort = proceed`). */
  const finishLevel = useCallback(() => {
    const properties = {level: levelRef.current};
    void run('FinishLevel', properties, decision => {
      if (decision.outcome === 'proceed') {
        setLevel(current => {
          const next = current + 1;
          appendLog({kind: 'gate', name: 'app.proceed', params: [{key: 'level', value: next}]});
          return next;
        });
      } else {
        appendLog({
          kind: 'gate',
          name: 'app.hold',
          params: [{key: 'level', value: levelRef.current}],
        });
      }
    });
  }, [appendLog, run]);

  /** Rewarded: the bonus is granted only when the gate says proceed (`onAbort = cancel`). */
  const claimBonus = useCallback(() => {
    void run('ClaimBonus', {source: 'home'}, decision => {
      if (decision.outcome === 'proceed') {
        setCoins(current => {
          const next = current + 50;
          appendLog({kind: 'gate', name: 'app.proceed', params: [{key: 'coins', value: next}]});
          return next;
        });
      } else {
        appendLog({kind: 'gate', name: 'app.hold', note: 'no coins granted'});
      }
    });
  }, [appendLog, run]);

  const withdraw = useCallback(() => {
    const count = withdrawalsRef.current.length;
    withdrawalsRef.current.forEach(unsubscribe => unsubscribe());
    withdrawalsRef.current = [];
    setRegistered(false);
    appendLog({
      kind: 'gate',
      name: 'gate.withdraw',
      params: [
        {key: 'withdrawn', value: count},
        {key: '', value: 'gated calls now fail open'},
      ],
      severity: 'warn',
    });
  }, [appendLog]);

  const runSeededRound = useCallback(() => {
    autoResolveRef.current = 'watched';
    finishLevel();
  }, [finishLevel]);

  const reportAdOutcome = useCallback(
    (outcome: AdOutcome) => {
      pending?.report(outcome);
    },
    [pending],
  );

  return {
    isRegistered,
    trace,
    level,
    coins,
    pendingAd: pending?.request ?? null,
    reportAdOutcome,
    finishLevel,
    claimBonus,
    withdraw,
    runSeededRound,
  };
}
