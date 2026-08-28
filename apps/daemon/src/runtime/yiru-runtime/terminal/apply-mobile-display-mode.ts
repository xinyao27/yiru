import { RuntimeTerminalHandleMobileUnsubscribe } from './handle-mobile-unsubscribe'

export abstract class RuntimeTerminalApplyMobileDisplayMode extends RuntimeTerminalHandleMobileUnsubscribe {
  async applyMobileDisplayMode(ptyId: string): Promise<boolean> {
    const mode = this.getMobileDisplayMode(ptyId)
    const subscribers = this.terminalSessions.listMobileSubscribers(ptyId)
    const subscriber = this.pickMostRecentActor(subscribers)
    const subscriberRecord = subscriber
      ? this.terminalSessions.getMobileSubscriber(ptyId, subscriber.clientId)
      : null

    if (mode === 'desktop') {
      // Reset wasResizedToPhone on every fitted subscriber so a future
      // toggle back to auto re-issues the resize. applyLayout owns the
      // actual PTY resize + override delete + renderer notify. Track which
      // subscribers we cleared so a failed resize can re-arm them.
      const clearedFitSubscriberIds = this.terminalSessions.clearMobilePhoneFits(ptyId)
      const anyWasResized = clearedFitSubscriberIds.length > 0
      // Why (#7588): also restore when a fit-override is still held but no
      // subscriber carries wasResizedToPhone — e.g. a null-viewport resubscribe
      // after an indefinite hold resets the flag yet leaves the override,
      // stranding the desktop "phone size" modal. Reuse resolveDesktopRestoreTarget
      // (the same resolver the anyWasResized branch uses) so the two adjacent
      // restore paths can never resolve to different dims for the same state.
      if (anyWasResized || this.terminalSessions.hasFitOverride(ptyId)) {
        const restore = this.resolveDesktopRestoreTarget(ptyId)
        const result = await this.enqueueLayout(ptyId, {
          kind: 'desktop',
          cols: restore.cols,
          rows: restore.rows
        })
        // Why (#7588): a failed resize rolls the override back (still held), so
        // re-arm the flags we cleared. Otherwise a later unsubscribe under a
        // finite mobileAutoRestoreFitMs would see wasResizedToPhone=false, skip
        // scheduling its auto-restore timer, and strand the held phone-fit.
        if (!result.ok) {
          this.terminalSessions.restoreMobilePhoneFits(ptyId, clearedFitSubscriberIds)
        }
      } else {
        // Nothing was fitted or held — emit a mode-change resize event so
        // the mobile client still learns the toggle landed.
        const size = this.getTerminalSize(ptyId)
        this.notifyTerminalResize(ptyId, {
          cols: size?.cols ?? 0,
          rows: size?.rows ?? 0,
          displayMode: 'desktop',
          reason: 'mode-change',
          seq: this.terminalSessions.getLayout(ptyId)?.seq
        })
      }
    } else {
      // mode === 'auto' — the only non-desktop mode after the 'phone'
      // (sticky-fit) collapse. Phone-fit if the active subscriber has a
      // viewport and we haven't already applied it.
      if (subscriberRecord && !subscriberRecord.wasResizedToPhone) {
        const viewport = subscriberRecord.viewport
        if (viewport) {
          await this.handleMobileSubscribe(ptyId, subscriberRecord.clientId, viewport)
          // After a phone-fit an override IS held, so this reports false. The
          // auto branch is never reached from reclaim (it sets 'desktop'
          // first); computed here only to keep the post-condition uniform.
          return !this.terminalSessions.hasFitOverride(ptyId)
        }
      }
      // Why: always emit the mode change even when no resize occurred — the
      // mobile client needs to learn the toggle landed even if dims didn't
      // actually change. Carry the current seq (or undefined if no layout
      // entry yet) so the mobile-side stale-event filter behaves correctly.
      const size = this.getTerminalSize(ptyId)
      this.notifyTerminalResize(ptyId, {
        cols: size?.cols ?? 0,
        rows: size?.rows ?? 0,
        displayMode: 'auto',
        reason: 'mode-change',
        seq: this.terminalSessions.getLayout(ptyId)?.seq
      })
    }
    return !this.terminalSessions.hasFitOverride(ptyId)
  }

  // Why: called after a desktop renderer path has successfully resized the
  // PTY (local IPC or remote desktop viewport). The runtime mirror must take
  // the same accepted geometry so hidden-output restore parses at PTY width.

  onExternalPtyResize(ptyId: string, cols: number, rows: number): void {
    // The pty:resize IPC handler is supposed to gate via `isResizeSuppressed`
    // before calling here, but defend against callers that don't.
    if (this.isResizeSuppressed()) {
      return
    }
    // Why: while a mobile-fit override is in place, the desktop renderer's
    // safeFit echoes pty:resize(override.cols, override.rows). Treating that
    // echo as legitimate geometry would overwrite each subscriber's
    // previousCols/Rows baseline with phone dims, so the next take-back
    // enqueues a no-op {kind:'desktop', cols:49, rows:40} and leaves xterm
    // stuck. Only filter reports that EXACTLY match the override — a fresh
    // measurement from a now-visible pane (e.g. user activated a previously
    // hidden tab on desktop, container went 0×0 → 1782×1195) reports
    // different dims and is the right baseline to remember.
    const activeOverride = this.terminalSessions.getFitOverride(ptyId)
    if (activeOverride && activeOverride.cols === cols && activeOverride.rows === rows) {
      return
    }
    // Why: a successful host resize supersedes any target retained after a
    // failed viewer reclaim; a later viewer cycle must capture this new truth.
    if (!this.hasRemoteDesktopViewers(ptyId)) {
      this.terminalSessions.deleteRemoteDesktopHostReclaimTarget(ptyId)
    }
    this.resizeHeadlessTerminal(ptyId, cols, rows)
    this.refreshRendererGeometry(ptyId, cols, rows)
  }

  // Why: pty:reportGeometry IPC sibling. The renderer calls this when a
  // desktop pane container goes from 0×0 to a real size while a mobile-fit
  // override is active (e.g. user activates a previously-hidden tab on
  // desktop after the phone has already taken the floor). We need the
  // restore-target baseline to track real desktop dims even during the
  // fit period — otherwise resolveDesktopRestoreTarget falls back to the
  // PTY's spawn default (typically 80×24) and Take Back leaves the
  // terminal partially restored. This is a measurement-only channel: it
  // refreshes lastRendererSizes and non-null subscriber baselines, never
  // resizes the PTY, and bypasses both isResizeSuppressed and the
  // override-echo gate by design — the renderer only fires it when it
  // has just measured fresh real geometry. See docs/mobile-fit-hold.md.

  recordRendererGeometry(ptyId: string, cols: number, rows: number): void {
    if (cols <= 0 || rows <= 0) {
      return
    }
    // Why: a viewer may leave while phone-fit still owns the PTY. Keep its
    // deferred host reclaim cache aligned with later trusted pane measurements.
    if (this.terminalSessions.getRemoteDesktopHostReclaimTarget(ptyId)) {
      this.terminalSessions.setRemoteDesktopHostReclaimTarget(ptyId, { cols, rows })
    }
    this.refreshRendererGeometry(ptyId, cols, rows)
  }

  protected refreshRendererGeometry(ptyId: string, cols: number, rows: number): void {
    this.terminalSessions.setLastRendererSize(ptyId, cols, rows)
    // Refresh the renderer-current size as the next-restore target on every
    // subscriber that already has a non-null baseline. Subscribers with null
    // baselines (joined while a peer had already phone-fitted) stay null.
    this.terminalSessions.refreshMobileRestoreBaselines(ptyId, { cols, rows })
  }

  // Why: the pty:resize IPC handler calls this to check if the global
  // suppress window is active. During this window, all desktop renderer
  // pty:resize events are ignored to prevent collateral safeFit corruption.

  isResizeSuppressed(): boolean {
    return this.terminalSessions.isResizeSuppressed()
  }

  subscribeToTerminalResize(
    ptyId: string,
    listener: (event: {
      cols: number
      rows: number
      displayMode: string
      reason: string
      seq?: number
    }) => void
  ): () => void {
    return this.terminalSessions.subscribeToResize(ptyId, listener)
  }

  protected notifyTerminalResize(
    ptyId: string,
    event: { cols: number; rows: number; displayMode: string; reason: string; seq?: number }
  ): void {
    this.terminalSessions.emitResize(ptyId, event)
  }

  // Why: Section 7.2 — the runtime detects agent exit directly and updates
  // dispatch contexts immediately, rather than waiting for the coordinator's
  // next poll cycle. This catches agent crashes and unexpected exits within
  // milliseconds. The task is set back to 'pending' so it can be re-dispatched.
}
