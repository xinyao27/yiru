import { isPiCompatibleAgentType } from '~shared/pi-agent-kind'

import { CompletionCoordinatorFoundation } from './completion-coordinator-foundation'
import type { AgentCompletionStatusSnapshot } from './completion-coordinator-types'
import {
  CODEX_ATTENTION_QUIET_MS,
  COMPLETION_REPLAY_GUARD_MS,
  lastCompletionIdentityByPaneKey,
  hookCompletionAgentIdentity,
  hookCompletionIdentity,
  type CompletionSource,
  type LastCompletionIdentity
} from './completion-signals'

export abstract class CompletionCoordinatorLayer1 extends CompletionCoordinatorFoundation {
  protected clearPollTimer(): void {
    if (this.pollTimer === null) {
      return
    }
    clearTimeout(this.pollTimer)
    this.pollTimer = null
    this.pollTimerTier = null
  }

  protected clearPendingTitleTimer(): void {
    if (this.pendingTitleTimer === null) {
      return
    }
    clearTimeout(this.pendingTitleTimer)
    this.pendingTitleTimer = null
  }

  protected clearPendingHookDone(): void {
    if (this.pendingHookDoneTimer !== null) {
      clearTimeout(this.pendingHookDoneTimer)
      this.pendingHookDoneTimer = null
    }
    this.pendingHookDoneTitle = null
    this.pendingHookDonePayload = null
  }

  protected clearPendingCodexAttention(): void {
    if (this.pendingCodexAttentionTimer !== null) {
      clearTimeout(this.pendingCodexAttentionTimer)
      this.pendingCodexAttentionTimer = null
    }
  }

  protected establishAgentEvidence(): void {
    this.agentIdentityEstablished = true
    this.hasAgentRunEvidence = true
    this.scheduleNextPoll()
  }

  protected clearAgentRunEvidence(): void {
    this.agentIdentityEstablished = false
    this.hasAgentRunEvidence = false
    this.workingStatusObserved = false
    this.pendingProcessExitAgent = null
    this.dropPendingTitle()
  }

  protected completionToken(source: CompletionSource): string {
    if (this.workingStatusObserved) {
      return `turn:${this.currentTurn}`
    }
    if (this.lastForegroundAgent) {
      return `process:${this.processSession}`
    }
    return `${source}:${this.currentTurn}:${this.processSession}`
  }

  protected doneShouldUseQuietWindow(payload: AgentCompletionStatusSnapshot): boolean {
    // Why: Pi/OMP emit milestone 'done' while still working, so route their done
    // through the quiet window (like a resumed turn) so later work can cancel it.
    return (
      this.workingStatusObserved || isPiCompatibleAgentType(hookCompletionAgentIdentity(payload))
    )
  }

  protected hookAttentionToken(payload: AgentCompletionStatusSnapshot): string {
    const identity = hookCompletionIdentity(payload)
    if (identity) {
      return `identity:${identity}`
    }
    return [
      'turn',
      String(this.currentTurn),
      payload.state,
      payload.agentType ?? '',
      payload.toolName ?? '',
      payload.toolInput ?? '',
      payload.prompt
    ].join(':')
  }

  protected completionIdentityAlreadyNotified(
    completionIdentity: LastCompletionIdentity | null | undefined
  ): boolean {
    if (!completionIdentity) {
      return false
    }
    const previous = lastCompletionIdentityByPaneKey.get(this.options.paneKey)
    if (!previous) {
      return false
    }
    if (previous.source === completionIdentity.source) {
      return previous.identity === completionIdentity.identity
    }
    return (
      previous.agentIdentity !== null &&
      completionIdentity.agentIdentity !== null &&
      previous.agentIdentity === completionIdentity.agentIdentity
    )
  }

  protected dispatchCompletion(
    source: CompletionSource,
    title: string,
    optionsOverride: {
      quietedHookDone?: boolean
      terminalIdleConfirmed?: boolean
      agentStatus?: AgentCompletionStatusSnapshot
      completionIdentity?: LastCompletionIdentity | null
    } = {}
  ): void {
    if (source !== 'hook' && this.pendingHookDoneTimer !== null) {
      return
    }
    if (this.requiresFreshWorking || this.lastCompletedTurn === this.currentTurn) {
      return
    }
    if (!this.options.isLive() || !this.hasAgentRunEvidence) {
      return
    }
    const now = Date.now()
    const token = this.completionToken(source)
    if (
      token === this.lastCompletionToken &&
      now - this.lastCompletionAt < COMPLETION_REPLAY_GUARD_MS
    ) {
      return
    }
    if (this.completionIdentityAlreadyNotified(optionsOverride.completionIdentity)) {
      return
    }
    this.lastCompletionToken = token
    this.lastCompletionAt = now
    this.lastCompletedTurn = this.currentTurn
    this.lastCompletionSource = source
    this.workingStatusObserved = false
    // Why: any committed completion (hook/title/process-exit) ends the turn, so a
    // debounced Codex attention from an earlier pause must never fire after it.
    this.clearPendingCodexAttention()
    if (optionsOverride.completionIdentity) {
      lastCompletionIdentityByPaneKey.set(this.options.paneKey, optionsOverride.completionIdentity)
    }
    if (source === 'hook' && optionsOverride.agentStatus) {
      this.options.dispatchHookLifecycle?.(optionsOverride.agentStatus)
    }
    if (optionsOverride.quietedHookDone === true || source === 'process-exit') {
      // Why: confirmed process death is independent completion evidence; keep
      // its provenance so stale hook rows cannot veto the notification later.
      this.options.dispatchCompletion(title, {
        source,
        quietedHookDone: optionsOverride.quietedHookDone === true,
        ...(optionsOverride.terminalIdleConfirmed === true ? { terminalIdleConfirmed: true } : {}),
        ...(optionsOverride.agentStatus ? { agentStatus: optionsOverride.agentStatus } : {})
      })
    } else {
      this.options.dispatchCompletion(title)
    }
  }

  protected dispatchAttentionNotification(payload: AgentCompletionStatusSnapshot): void {
    this.options.dispatchAttention?.(payload.agentType ?? this.options.paneKey, {
      source: 'hook',
      agentStatus: payload
    })
  }

  protected dispatchAttention(payload: AgentCompletionStatusSnapshot): void {
    if (!this.options.dispatchAttention || !this.options.isLive() || !this.hasAgentRunEvidence) {
      return
    }
    const token = this.hookAttentionToken(payload)
    if (token === this.lastAttentionToken) {
      return
    }
    this.lastAttentionToken = token
    // Why: the visual "needs input" status must update immediately for every
    // agent; only the OS attention notification is debounced (Codex, below).
    this.options.dispatchHookLifecycle?.(payload)
    if (payload.agentType === 'codex') {
      // Why: a Codex PermissionRequest that "Approve for me" auto-resolves fires a
      // working/completion hook inside this window, which cancels the pending
      // notification (see CODEX_ATTENTION_QUIET_MS). Scoped to Codex so every other
      // agent's genuine pause still notifies immediately.
      this.clearPendingCodexAttention()
      this.pendingCodexAttentionTimer = setTimeout(() => {
        this.pendingCodexAttentionTimer = null
        if (!this.options.isLive() || !this.hasAgentRunEvidence) {
          return
        }
        this.dispatchAttentionNotification(payload)
      }, CODEX_ATTENTION_QUIET_MS)
      return
    }
    this.dispatchAttentionNotification(payload)
  }
}
