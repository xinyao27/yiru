import {
  MOBILE_AUTO_RESTORE_FIT_MAX_MS,
  MOBILE_AUTO_RESTORE_FIT_MIN_MS
} from '../model/terminal-wait-readiness'
import type {
  ApplyLayoutResult,
  PtyLayoutState,
  PtyLayoutTarget
} from '../model/worktree-resolution'
import { RuntimeTerminalBeginMobileInputFloor } from './begin-mobile-input-floor'

export abstract class RuntimeTerminalReclaimTerminalForDesktop extends RuntimeTerminalBeginMobileInputFloor {
  async reclaimTerminalForDesktop(ptyId: string): Promise<boolean> {
    if (this.isMobileSubscriberActive(ptyId)) {
      this.setMobileDisplayMode(ptyId, 'desktop')
      await this.applyMobileDisplayMode(ptyId)
      this.releaseDesktopTakeBack(ptyId)
      // Why: a desktop-initiated reclaim is "I'm taking over right now", not a
      // sticky preference. The next mobile subscribe (e.g. user switches back to
      // the terminal tab on the phone) must default to phone-fit again, not stay
      // in passive desktop-watch mode.
      this.setMobileDisplayMode(ptyId, 'auto')
      if (this.hasRemoteDesktopLayoutState(ptyId)) {
        return this.applyRemoteDesktopLayout(ptyId)
      }
      return true
    }
    const heldOverride = this.terminalSessions.getFitOverride(ptyId)
    if (heldOverride && this.hasRemoteDesktopLayoutState(ptyId)) {
      this.terminalSessions.cancelMobileRestoreTimer(ptyId)
      this.terminalSessions.cancelMobileSoftLeaver(ptyId)
      const priorDriver = this.getDriver(ptyId)
      this.setDriver(ptyId, { kind: 'idle' })
      const converged = await this.applyRemoteDesktopLayout(ptyId)
      if (!converged) {
        this.setDriver(ptyId, priorDriver)
        return false
      }
      this.setDriver(ptyId, { kind: 'desktop' })
      this.setMobileDisplayMode(ptyId, 'auto')
      return true
    }
    if (heldOverride) {
      this.terminalSessions.cancelMobileRestoreTimer(ptyId)
      // Why: with no subscribers, resolveDesktopRestoreTarget can fall through
      // to current PTY size — which is at phone dims (wrong). Prefer a fresh
      // desktop renderer measurement when one exists; otherwise use the
      // override's pre-fit baseline before falling back to current size.
      const fallback = this.resolveDesktopRestoreTarget(ptyId)
      const renderer = this.terminalSessions.getLastRendererSize(ptyId)
      const cols = renderer?.cols ?? heldOverride.previousCols ?? fallback.cols
      const rows = renderer?.rows ?? heldOverride.previousRows ?? fallback.rows
      await this.enqueueLayout(ptyId, { kind: 'desktop', cols, rows })
      this.releaseDesktopTakeBack(ptyId)
      this.setMobileDisplayMode(ptyId, 'auto')
      return true
    }
    if (this.terminalSessions.getRemoteDesktopOwner(ptyId)) {
      const restore = this.resolveRemoteDesktopHostReclaimTarget(ptyId)
      return this.claimRemoteDesktopHost(ptyId, restore.cols, restore.rows)
    }
    // Why: a stale lock — driver still reads mobile with no active subscriber
    // and no held override (e.g. reclaimed inside the soft-leave grace, or a
    // subscriber that dropped without a clean unsubscribe). Release it so the
    // banner can't linger; there is nothing to resize.
    if (this.getDriver(ptyId).kind === 'mobile') {
      this.releaseDesktopTakeBack(ptyId)
      return true
    }
    return false
  }

  // Why: the shared "banner must be gone now" step for an explicit desktop
  // take-back. Releases the presence lock (driver → desktop) and, if the
  // best-effort resize left a fit-override held (resize didn't converge),
  // clears it optimistically with a paired desktop-fit 0×0 — the same signal
  // onPtyExit emits — so neither the presence-lock banner nor the held-fit
  // banner can survive the reclaim. The desktop renderer refits the PTY to real
  // dims on its next settled frame.

  protected releaseDesktopTakeBack(ptyId: string): void {
    this.setDriver(ptyId, { kind: 'desktop' })
    this.terminalSessions.releaseFitOverride(ptyId)
  }

  // Why: read-side clamp for mobileAutoRestoreFitMs. `null` means
  // indefinite hold (no auto-restore timer). A finite value is clamped
  // to [MIN, MAX] to defend against bad config — the smallest useful
  // value is a few seconds, the largest is one hour. See
  // docs/mobile-fit-hold.md.

  protected getAutoRestoreFitMs(): number | null {
    const raw = this.store?.getSettings().mobileAutoRestoreFitMs ?? null
    if (raw == null) {
      return null
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return null
    }
    return Math.min(Math.max(raw, MOBILE_AUTO_RESTORE_FIT_MIN_MS), MOBILE_AUTO_RESTORE_FIT_MAX_MS)
  }

  // Why: invoked when the user changes mobileAutoRestoreFitMs to `null`
  // (Indefinite). Clears every pending restore timer so the just-expressed
  // preference "do not auto-restore" is honored for ALL currently-pending
  // PTYs, not just one. See docs/mobile-fit-hold.md.

  cancelAllPendingFitRestoreTimers(): void {
    this.terminalSessions.cancelAllMobileRestoreTimers()
  }

  // Why: read the persisted user preference (clamped) for surfacing to UI
  // callers (mobile RPC, desktop preferences). Returns null when the
  // setting is unset or `null` ("Indefinite").

  getMobileAutoRestoreFitMs(): number | null {
    return this.getAutoRestoreFitMs()
  }

  // Why: persisted-preference setter routed through the same `Store` the
  // desktop preferences UI writes to. Transitions to `null` (Indefinite)
  // clear every pending restore timer to honor the preference change for
  // already-held PTYs. Transitions to a finite value do NOT retroactively
  // schedule timers for PTYs that are currently held — those PTYs were
  // already-not-restored under the old preference, and silently scheduling
  // a restore on a settings change would be surprising. The new value
  // takes effect on the next unsubscribe. See docs/mobile-fit-hold.md.

  setMobileAutoRestoreFitMs(ms: number | null): number | null {
    if (!this.store?.updateSettings) {
      return this.getAutoRestoreFitMs()
    }
    let normalized: number | null
    if (ms == null) {
      normalized = null
    } else if (typeof ms !== 'number' || !Number.isFinite(ms)) {
      normalized = null
    } else {
      normalized = Math.min(
        Math.max(ms, MOBILE_AUTO_RESTORE_FIT_MIN_MS),
        MOBILE_AUTO_RESTORE_FIT_MAX_MS
      )
    }
    this.store.updateSettings({ mobileAutoRestoreFitMs: normalized }, { notifyListeners: true })
    if (normalized == null) {
      this.cancelAllPendingFitRestoreTimers()
    }
    return normalized
  }

  // Why: with multiple subscribers, the active phone-fit dims follow the
  // most recent mobile actor (argmax(lastActedAt)). See
  // docs/mobile-presence-lock.md "Active phone-fit dim selection".

  protected pickMostRecentActor(
    subscribers: Iterable<{ clientId: string; lastActedAt: number }>
  ): { clientId: string; lastActedAt: number } | null {
    let best: { clientId: string; lastActedAt: number } | null = null
    for (const sub of subscribers) {
      if (best === null || sub.lastActedAt > best.lastActedAt) {
        best = sub
      }
    }
    return best
  }

  // ─── Layout authority adapter ─────────────────────────────────────

  getLayout(ptyId: string): PtyLayoutState | null {
    return this.terminalSessions.getLayout(ptyId)
  }

  protected resolveDesktopRestoreTarget(ptyId: string): { cols: number; rows: number } {
    return this.terminalSessions.resolveDesktopRestoreTarget(ptyId)
  }

  protected enqueueLayout(
    ptyId: string,
    target: PtyLayoutTarget,
    allowInitial = false
  ): Promise<ApplyLayoutResult> {
    return this.terminalSessions.enqueueLayout(ptyId, target, allowInitial)
  }

  // ─── Server-Authoritative Mobile Display Mode ─────────────────────────────────────────

  setMobileDisplayMode(ptyId: string, mode: 'auto' | 'desktop'): void {
    this.terminalSessions.setMobileDisplayMode(ptyId, mode)
  }

  getMobileDisplayMode(ptyId: string): 'auto' | 'desktop' {
    return this.terminalSessions.getMobileDisplayMode(ptyId)
  }

  isMobileSubscriberActive(ptyId: string): boolean {
    return this.terminalSessions.hasMobileSubscribers(ptyId)
  }

  // Why: late-bind viewport on an existing subscriber record. Subscribers
  // that registered before the mobile side measured (e.g. terminal first
  // mounted while the WebView was still loading) have null viewport, and
  // applyMobileDisplayMode's auto branch needs a viewport to phone-fit.
  // The setDisplayMode RPC carries the latest viewport so we can patch it
  // here just before applyMobileDisplayMode runs.
}
