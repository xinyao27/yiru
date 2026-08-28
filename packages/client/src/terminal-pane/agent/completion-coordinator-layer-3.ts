import { CompletionCoordinatorLayer2 } from './completion-coordinator-layer-2'
import {
  COMPLETION_REPLAY_GUARD_MS,
  lastCompletionIdentityByPaneKey,
  NO_EVIDENCE_ACTIVITY_HOT_WINDOW_MS,
  POLL_TIER_INTERVAL_MS,
  type PollCadenceTier
} from './completion-signals'
import { enqueueAgentProcessInspection, type InspectionPriority } from './process-inspection-queue'

export abstract class CompletionCoordinatorLayer3 extends CompletionCoordinatorLayer2 {
  protected requestInspection(priority: InspectionPriority): void {
    if (this.disposed || this.inspectionInFlight || !this.options.isLive()) {
      return
    }
    if (priority === 'cadence' && !this.shouldRunCadenceInspection()) {
      return
    }
    const ptyId = this.options.getPtyId()
    if (!ptyId) {
      return
    }
    this.inspectionInFlight = true
    const generationAtRequest = this.inspectionGeneration
    const pendingTitleIdAtRequest = priority === 'pending-title' ? this.pendingTitle?.id : null
    enqueueAgentProcessInspection({
      priority,
      run: async () => {
        let inspectedRecognizedAgent = false
        let inspectionSucceeded = false
        try {
          const result = await this.options.inspectProcess(this.options.getSettings(), ptyId)
          if (!this.disposed && generationAtRequest === this.inspectionGeneration) {
            const appliesToCurrentPendingTitle =
              !this.pendingTitle ||
              (priority === 'pending-title' && this.pendingTitle.id === pendingTitleIdAtRequest)
            if (appliesToCurrentPendingTitle) {
              inspectedRecognizedAgent = this.handleProcessInspectionResult(result)
            }
            inspectionSucceeded = true
          }
        } catch {
          this.consecutiveInspectionErrors += 1
        } finally {
          this.inspectionInFlight = false
          if (generationAtRequest !== this.inspectionGeneration) {
            if (this.pendingTitle) {
              this.requestInspection('pending-title')
            } else {
              this.scheduleNextPoll()
            }
          } else {
            if (this.pendingTitle) {
              if (
                priority === 'pending-title' &&
                this.pendingTitle.id === pendingTitleIdAtRequest
              ) {
                this.pendingTitle.firstInspectionFinished = true
                if (inspectionSucceeded && inspectedRecognizedAgent) {
                  this.pendingTitle.validatedByFreshInspection = true
                  this.dispatchPendingTitleIfEligible()
                } else if (!inspectionSucceeded) {
                  this.dropPendingTitle()
                }
                this.schedulePendingTitleExpiry()
              } else {
                // Why: only the probe requested for this exact pending title
                // can prove it belongs to an agent; older in-flight probes are
                // stale even when they were also pending-title inspections.
                this.requestInspection('pending-title')
              }
            }
            this.scheduleNextPoll()
          }
        }
      }
    })
  }

  protected shouldRunCadenceInspection(): boolean {
    // Why: hidden idle terminals should not join the global process-inspection
    // cadence. Once a pane has agent evidence, keep the backstop alive so an
    // unannounced process exit can still produce/clear completion state.
    return (
      this.hasAgentRunEvidence ||
      this.lastForegroundAgent !== null ||
      this.options.shouldPollProcessCadence?.() !== false
    )
  }

  protected isHiddenBackstop(): boolean {
    // Why: cadence runs as a hidden-pane backstop only when visibility is known
    // to be false. An undefined option (coordinators with no visibility source)
    // keeps full cadence, matching pre-throttle behavior.
    return this.options.shouldPollProcessCadence?.() === false
  }

  protected paneActivityWithinHotWindow(): boolean {
    return (
      this.lastPaneActivityAt > 0 &&
      Date.now() - this.lastPaneActivityAt < NO_EVIDENCE_ACTIVITY_HOT_WINDOW_MS
    )
  }

  protected currentPollTier(): PollCadenceTier {
    if (this.isHiddenBackstop()) {
      return 'hidden'
    }
    if (this.lastForegroundAgent) {
      return 'active'
    }
    if (this.hasAgentRunEvidence) {
      return 'idle'
    }
    // Why: only costly hosts relax the no-evidence cadence; recent pane
    // activity keeps it hot so an agent start is inspected promptly.
    if (
      this.options.isProcessInspectionCostly?.() === true &&
      !this.paneActivityWithinHotWindow()
    ) {
      return 'no-evidence'
    }
    return 'idle'
  }

  protected nextPollInterval(tier: PollCadenceTier): number {
    // Why: a hidden pane polls slowly (backstop only); a visible pane keeps full
    // cadence so the foreground experience is unchanged.
    const base = POLL_TIER_INTERVAL_MS[tier]
    const backoff =
      this.consecutiveInspectionErrors > 0
        ? // Why: max(base, ...) keeps error backoff from *accelerating* tiers
          // already slower than the 10s backoff ceiling (no-evidence is 15s).
          Math.min(Math.max(10_000, base), base * 2 ** this.consecutiveInspectionErrors)
        : base
    const jitter = 1 + (Math.random() * 0.2 - 0.1)
    return Math.round(backoff * jitter)
  }

  protected scheduleNextPoll(): void {
    if (this.disposed || !this.pollTrackingStarted || !this.options.isLive() || this.pendingTitle) {
      return
    }
    const tier = this.currentPollTier()
    if (this.pollTimer !== null) {
      // Why: a pane whose tier moved to a faster cadence (hidden pane became
      // visible, no-evidence pane saw activity or evidence) has a slow timer
      // armed; re-arm at the faster cadence now instead of waiting it out.
      if (
        this.pollTimerTier !== null &&
        POLL_TIER_INTERVAL_MS[tier] < POLL_TIER_INTERVAL_MS[this.pollTimerTier]
      ) {
        this.clearPollTimer()
      } else {
        return
      }
    }
    if (!this.shouldRunCadenceInspection()) {
      return
    }
    const ptyId = this.options.getPtyId()
    if (!ptyId) {
      return
    }
    this.pollTimerTier = tier
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null
      this.pollTimerTier = null
      this.requestInspection('cadence')
    }, this.nextPollInterval(tier))
  }

  protected recordPaneActivity(): void {
    this.lastPaneActivityAt = Date.now()
    // Why: activity is the escalation signal that ends the relaxed no-evidence
    // cadence — re-arm only when the armed timer is the slow tier (or none is
    // armed) so per-output-chunk calls stay near-free on hot panes.
    if (this.pollTimer === null || this.pollTimerTier === 'no-evidence') {
      this.scheduleNextPoll()
    }
  }

  public observeOutputActivity(): void {
    this.recordPaneActivity()
  }

  protected recordTitleWorking(): boolean {
    // Why: hooks can report `done` before title tracking notices the next
    // milestone. The title working signal must cancel that provisional done.
    this.clearPendingHookDone()
    if (
      this.lastCompletionSource === 'hook' &&
      Date.now() - this.lastCompletionAt < COMPLETION_REPLAY_GUARD_MS
    ) {
      return false
    }
    // Why: a genuine Codex resume can surface as a working-spinner title before
    // (or instead of) the resume 'working' hook, so cancel the debounced
    // attention here or the self-resolving pause still fires a false banner
    // (#8387). Placed after the replay guard so only an authoritative resume —
    // not a stale post-completion title replay — drops a still-pending banner.
    this.clearPendingCodexAttention()
    this.workingStatusObserved = true
    this.requiresFreshWorking = false
    lastCompletionIdentityByPaneKey.delete(this.options.paneKey)
    this.currentTurn += 1
    this.dropPendingTitle()
    return true
  }

  public observeTitleWorking(): void {
    this.recordTitleWorking()
  }
}
