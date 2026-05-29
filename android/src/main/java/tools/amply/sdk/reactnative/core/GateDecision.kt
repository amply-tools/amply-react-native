package tools.amply.sdk.reactnative.core

/**
 * Bridge-level collapsed gate decision, mirroring the KMP `GateDecision`. The raw
 * `CampaignResult` is never surfaced to JS — it is collapsed into this here.
 *
 * Maps to the JS-facing shape:
 *   { outcome: "proceed", reason: "completed" | "failOpen" } | { outcome: "cancelled" }
 */
sealed interface GateDecision {
  enum class ProceedReason(val wire: String) {
    COMPLETED("completed"),
    FAIL_OPEN("failOpen"),
  }

  data class Proceed(val reason: ProceedReason) : GateDecision
  data object Cancelled : GateDecision

  companion object {
    val FAIL_OPEN: Proceed = Proceed(ProceedReason.FAIL_OPEN)
    val COMPLETED: Proceed = Proceed(ProceedReason.COMPLETED)
  }
}
