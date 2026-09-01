import { RuntimeTerminalUpdateMobileSubscriberViewport } from './update-mobile-subscriber-viewport'

export abstract class RuntimeTerminalHandleMobileUnsubscribe extends RuntimeTerminalUpdateMobileSubscriberViewport {
  handleMobileUnsubscribe(ptyId: string, clientId: string): void {
    const subscriber = this.terminalSessions.getMobileSubscriber(ptyId, clientId)
    if (!subscriber) {
      return
    }
    const wasResizedToPhone = subscriber.wasResizedToPhone

    this.terminalSessions.deleteMobileSubscriber(ptyId, clientId)
    this.notifyRemoteTerminalViewPresenceChanged(ptyId)
    const remainingSubscribers = this.terminalSessions.listMobileSubscribers(ptyId)

    if (remainingSubscribers.length > 0) {
      // Why: if the leaving client was the only one with a non-null restore
      // baseline (typical when peer joiners subscribed against an
      // already-phone-fitted PTY and got null prevCols), donate the baseline
      // to the earliest surviving subscriber so a future last-leaver can
      // still restore correctly. See docs/mobile-presence-lock.md.
      if (subscriber.previousCols != null && subscriber.previousRows != null) {
        this.terminalSessions.donateMobileRestoreBaseline(ptyId, {
          cols: subscriber.previousCols,
          rows: subscriber.previousRows
        })
      }
      // Peers still on the line. If the disconnecting client was the active
      // mobile driver, re-elect the most-recent surviving subscriber so the
      // banner remains correct and active phone-fit dims follow them.
      const driver = this.getDriver(ptyId)
      if (driver.kind === 'mobile' && driver.clientId === clientId) {
        const next = this.pickMostRecentActor(remainingSubscribers)
        if (next) {
          this.setDriver(ptyId, { kind: 'mobile', clientId: next.clientId })
          // Fire-and-forget — handleMobileUnsubscribe stays sync; applyLayout
          // failures self-recover on the next gesture.
          void this.applyMobileDisplayMode(ptyId)
        }
      }
      return
    }

    // Last subscriber leaving — clean up.
    this.terminalSessions.deleteMobileSubscribers(ptyId)
    const mode = this.getMobileDisplayMode(ptyId)

    // Resubscribe-grace: hold driver=mobile{clientId} for ~250ms so a quick
    // re-subscribe (older clients without updateViewport) doesn't flash the
    // desktop banner. See docs/mobile-presence-lock.md.
    const SOFT_LEAVE_GRACE_MS = 250
    this.terminalSessions.cancelMobileSoftLeaver(ptyId)
    const softTimer = setTimeout(() => {
      this.terminalSessions.takeMobileSoftLeaver(ptyId)
      if (!this.terminalSessions.hasMobileSubscribers(ptyId)) {
        this.setDriver(ptyId, { kind: 'idle' })
        if (this.hasRemoteDesktopViewers(ptyId)) {
          void this.applyRemoteDesktopLayout(ptyId)
        }
      }
    }, SOFT_LEAVE_GRACE_MS)
    if (typeof softTimer.unref === 'function') {
      softTimer.unref()
    }
    this.terminalSessions.setMobileSoftLeaver(ptyId, {
      clientId,
      timer: softTimer,
      record: {
        clientId: subscriber.clientId,
        viewport: subscriber.viewport,
        wasResizedToPhone: subscriber.wasResizedToPhone,
        previousCols: subscriber.previousCols,
        previousRows: subscriber.previousRows,
        subscribedAt: subscriber.subscribedAt,
        lastActedAt: subscriber.lastActedAt
      }
    })

    if (mode === 'auto' && wasResizedToPhone) {
      this.terminalSessions.cancelMobileRestoreTimer(ptyId)
      // Why: scheduling is conditional on the user's mobileAutoRestoreFitMs
      // preference. `null` (default, "Indefinite") leaves the PTY at phone
      // dims until the user clicks Restore on the desktop banner — the
      // central UX promise of docs/mobile-fit-hold.md. A finite value runs
      // the restore that long after the last unsubscribe.
      const autoRestoreMs = this.getAutoRestoreFitMs()
      if (autoRestoreMs == null) {
        // Indefinite hold: the fit override persists, the SOFT_LEAVE_GRACE
        // driver-state grace above still releases the input lock, and the
        // banner's Restore button is the explicit return path.
      } else {
        // Snapshot the disconnecting subscriber's baseline NOW, before the
        // timer fires. By the time the timer runs, the subscriber map has
        // been deleted; resolveDesktopRestoreTarget would fall through to
        // lastRendererSizes → current PTY size (which is at phone dims,
        // wrong). The disconnecting subscriber's baseline is the correct
        // restore target.
        const fallback = this.terminalSessions.getLastRendererSize(ptyId)
        const restoreCols =
          subscriber.previousCols ?? fallback?.cols ?? this.getTerminalSize(ptyId)?.cols ?? 80
        const restoreRows =
          subscriber.previousRows ?? fallback?.rows ?? this.getTerminalSize(ptyId)?.rows ?? 24
        const timer = setTimeout(() => {
          this.terminalSessions.clearMobileRestoreTimer(ptyId)
          if (this.isMobileSubscriberActive(ptyId)) {
            return
          }
          if (this.hasRemoteDesktopLayoutState(ptyId)) {
            void this.applyRemoteDesktopLayout(ptyId)
            return
          }
          void this.enqueueLayout(ptyId, {
            kind: 'desktop',
            cols: restoreCols,
            rows: restoreRows
          })
        }, autoRestoreMs)
        // Why: a delayed mobile restore should not keep the daemon alive
        // after the last window/runtime transport has otherwise shut down.
        if (typeof timer.unref === 'function') {
          timer.unref()
        }

        this.terminalSessions.setMobileRestoreTimer(ptyId, { timer, clientId })
      }
    }
    // 'desktop' mode: was never resized, nothing to restore.
  }

  // Why: called when mode changes via terminal.setDisplayMode. Applies the
  // mode change immediately if there's an active subscriber, and emits a
  // 'resized' event so the mobile client can reinitialize xterm inline.
  //
  // Multi-mobile: the most recent mobile actor's viewport drives the active
  // phone-fit dims. The earliest-by-subscribe-time subscriber's
  // previousCols/Rows drive the desktop-restore target.
  //
  // Returns the post-condition "no fit-override remains held" (#7588): `true`
  // when it cleared a held override OR nothing was held to begin with, `false`
  // only when a restore was attempted and the resize failed (override rolled
  // back, still held). reclaimTerminalForDesktop gates its driver/mode
  // transitions on this; other callers ignore it.
}
