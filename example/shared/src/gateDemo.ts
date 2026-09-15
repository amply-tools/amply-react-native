import {Theme} from './theme';
import type {JsonMap} from './format';

/**
 * The gate half of the sample: Amply decides WHETHER an interruption happens, the app runs it.
 *
 * This is the shape gates exist for — something long that Amply neither controls nor can see
 * inside. An ad is the clearest example: Amply knows the user finished a level and that a
 * campaign says "show an ad here", but the fill, the watch time and the outcome all belong to
 * the ad SDK. `trackGated` hands the decision out and awaits one of three answers.
 *
 * Two gates rather than one, because the interesting difference is what a DISMISS means:
 *
 * - interstitial with `onAbort: 'proceed'` — skipping must not trap the user on the
 *   level-complete screen, so a dismiss still proceeds.
 * - rewarded with `onAbort: 'cancel'` — the reward is the consideration for watching, so a
 *   dismiss cancels the bonus rather than granting it.
 *
 * Withdrawal is by the handle `registerGate` returns, not by URL. Holding it is the app's job: a
 * gate left registered behind a departed presenter parks the next gated call on that URL for its
 * whole fail-open timeout, with no crash and nothing in the console.
 */
export const INTERSTITIAL_GATE = 'amplysample://ad/interstitial';
export const REWARDED_GATE = 'amplysample://ad/rewarded';

/** Used when the campaign's action URL does not carry an override. */
export const DEFAULT_AD_SECONDS = 5;

/**
 * The SDK's own default, spelled out. `registerGate` treats `timeoutMs: 0` as "use the default"
 * on the JS side, but the native samples cannot — Kotlin's default argument produces no
 * Objective-C overload, so `0` there is clamped to the 1 s minimum and the gate fails open one
 * second in. Passing the real number keeps every sample on the same timeout.
 */
export const GATE_TIMEOUT_MS = 60_000;

export type AdFormat = 'interstitial' | 'rewarded';

/** How the ad ended, in the app's own words before it becomes an SDK result. */
export type AdOutcome = 'watched' | 'skipped' | 'noFill';

export type AdRequest = {
  format: AdFormat;
  adUnit: string;
  seconds: number;
  /** Shown on the claim button of a rewarded ad, e.g. "50 coins". */
  reward: string;
};

export function traceOutcomeFor(outcome: AdOutcome): string {
  switch (outcome) {
    case 'watched':
      return 'Completed';
    case 'skipped':
      return 'Dismissed';
    case 'noFill':
      return 'Unavailable(PresenterReported)';
  }
}

export type CampaignRef = {
  id: string;
  name: string;
};

/**
 * One structured entry per gated call — SAMPLE_APP_SPEC.md §4. Not free text.
 *
 * The `decision` line is the most important thing on the screen. Without it every gate demo
 * needs a paragraph explaining that an immediate proceed is *correct* when no campaign matched;
 * with it the paragraph is unnecessary, and — unlike the paragraph — it is also right when a
 * campaign DID match and the presenter timed out.
 */
export type DecisionTraceEntry = {
  event: string;
  /** `null` when nothing matched. */
  matched: CampaignRef | null;
  action: string | null;
  presenter: string;
  outcome: string | null;
  decision: string;
  /**
   * Measured in the app from the `trackGated` call to the decision, NOT read from the SDK. It is
   * the field that catches a gate whose timeout collapsed to the 1 s minimum: without an elapsed
   * column, a gate that failed open before any real ad could finish looks exactly like one that
   * never matched.
   */
  elapsedMs: number;
};

export function matchedText(entry: DecisionTraceEntry): string {
  return entry.matched ? `${entry.matched.name} (${entry.matched.id})` : '—';
}

export function elapsedText(entry: DecisionTraceEntry): string {
  return `${(entry.elapsedMs / 1000).toFixed(1)}s`;
}

/**
 * Green when the user actually completed the value exchange, amber when the SDK failed open
 * (correct, but nothing was earned), red when the app held. The only place colour is used in
 * this section.
 */
export function decisionColour(entry: DecisionTraceEntry): string {
  if (entry.decision.startsWith('cancelled')) {
    return Theme.red;
  }
  if (entry.decision.includes('completed')) {
    return Theme.green;
  }
  return Theme.orange;
}

export function tracePayload(entry: DecisionTraceEntry): JsonMap {
  const payload: JsonMap = {
    event: entry.event,
    matched: matchedText(entry),
    presenter: entry.presenter,
    decision: entry.decision,
    elapsed: elapsedText(entry),
  };
  if (entry.action) {
    payload.action = entry.action;
  }
  if (entry.outcome) {
    payload.outcome = entry.outcome;
  }
  return payload;
}

/** Last 5, per SAMPLE_APP_SPEC.md §2.3. */
export const TRACE_DEPTH = 5;
