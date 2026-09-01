import { CompletionCoordinatorLayer4 } from './completion-coordinator-layer-4'
import { lastCompletionIdentityByPaneKey } from './completion-signals'

export class CompletionCoordinatorLayer5 extends CompletionCoordinatorLayer4 {
  public dispose(): void {
    this.disposed = true
    this.clearPollTimer()
    this.clearPendingHookDone()
    this.clearPendingCodexAttention()
    this.dropPendingTitle()
    // Why: the dedup identity is module-scoped so it survives a live-stream remount
    // (this.dispose-then-recreate with the same paneKey while isLive() stays true). Only
    // evict it on genuine teardown — when the PTY is gone (isLive() false) — so the
    // never-reused ${tabId}:${leafUUID} key can't leak one identity per closed pane.
    if (!this.options.isLive()) {
      lastCompletionIdentityByPaneKey.delete(this.options.paneKey)
    }
  }
}
