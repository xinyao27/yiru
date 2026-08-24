import { RuntimeTerminalResizeForClient } from './resize-for-client'

export abstract class RuntimeTerminalOnClientDisconnected extends RuntimeTerminalResizeForClient {
  onClientDisconnected(clientId: string): void {
    this.fileCommands.revokeTerminalFileGrantsForClient(clientId)

    // (1) Cancel pending restore-debounce timers owned by this client.
    this.terminalSessions.cancelMobileRestoreTimersForClient(clientId)

    // (2) Promote any soft-leave grace owned by this client into immediate
    // finalization. Grace existed to absorb a quick re-subscribe; a real
    // disconnect kills any chance of re-subscribe.
    //
    // Note: this is mode-decoupled (matches docs/mobile-terminal-layout-state-machine.md
    // sub-case 2). Today's pre-rewrite code only restored when
    // `mode === 'auto' && wasResizedToPhone`; the new design restores
    // whenever the layout is currently `phone`. This is an intentional
    // behavior fix — `mode === 'phone'` with no subscribers is a degenerate
    // state nothing in product depends on.
    for (const [ptyId, soft] of this.terminalSessions.takeMobileSoftLeaversForClient(clientId)) {
      // Cancel any in-flight 300ms restore timer too — we'll handle it inline.
      this.terminalSessions.cancelMobileRestoreTimer(ptyId)

      const cur = this.terminalSessions.getLayout(ptyId)
      // Why: Indefinite hold (mobileAutoRestoreFitMs == null) keeps the PTY
      // at phone dims after the phone disconnects; the desktop banner's
      // Restore button is the explicit return path. See
      // docs/mobile-fit-hold.md.
      if (this.hasRemoteDesktopViewers(ptyId)) {
        this.setDriver(ptyId, { kind: 'idle' })
        void this.applyRemoteDesktopLayout(ptyId)
        continue
      } else if (cur?.kind === 'phone' && this.getAutoRestoreFitMs() != null) {
        if (this.terminalSessions.getRemoteDesktopHostReclaimTarget(ptyId)) {
          this.setDriver(ptyId, { kind: 'idle' })
          void this.applyRemoteDesktopLayout(ptyId)
          continue
        }
        // Use the soft-leaver's snapshot baseline as a hint, falling
        // through to resolveDesktopRestoreTarget for missing values.
        const fallback = this.resolveDesktopRestoreTarget(ptyId)
        const cols = soft.record.previousCols ?? fallback.cols
        const rows = soft.record.previousRows ?? fallback.rows
        void this.enqueueLayout(ptyId, { kind: 'desktop', cols, rows })
      }
      this.setDriver(ptyId, { kind: 'idle' })
    }

    // (3) Immediate restore for PTYs where this client was the last
    // mobile subscriber. With multi-mobile, peer subscribers keep the
    // floor; only when the inner map empties do we transition to desktop.
    const ptysWithSurvivingPeers: string[] = []
    const ptysToRestore: { ptyId: string; baseline: { cols: number; rows: number } | null }[] = []
    for (const { ptyId, subscriber, hasSurvivors } of this.terminalSessions.disconnectMobileClient(
      clientId
    )) {
      // Snapshot baseline before deleting — needed once mobileSubscribers
      // entry is gone for the resolveDesktopRestoreTarget chain.
      const baseline =
        subscriber.previousCols != null && subscriber.previousRows != null
          ? { cols: subscriber.previousCols, rows: subscriber.previousRows }
          : null
      this.notifyRemoteTerminalViewPresenceChanged(ptyId)
      if (hasSurvivors) {
        ptysWithSurvivingPeers.push(ptyId)
      } else {
        ptysToRestore.push({ ptyId, baseline })
      }
    }
    for (const { ptyId, baseline } of ptysToRestore) {
      const cur = this.terminalSessions.getLayout(ptyId)
      // Why: Indefinite hold gate — see soft-leaver branch above.
      if (this.hasRemoteDesktopViewers(ptyId)) {
        this.setDriver(ptyId, { kind: 'idle' })
        void this.applyRemoteDesktopLayout(ptyId)
        continue
      } else if (cur?.kind === 'phone' && this.getAutoRestoreFitMs() != null) {
        if (this.terminalSessions.getRemoteDesktopHostReclaimTarget(ptyId)) {
          this.setDriver(ptyId, { kind: 'idle' })
          void this.applyRemoteDesktopLayout(ptyId)
          continue
        }
        const fallback = this.resolveDesktopRestoreTarget(ptyId)
        const cols = baseline?.cols ?? fallback.cols
        const rows = baseline?.rows ?? fallback.rows
        void this.enqueueLayout(ptyId, { kind: 'desktop', cols, rows })
      }
      this.setDriver(ptyId, { kind: 'idle' })
    }

    // (4) Driver re-election where peers survived. If the disconnecting
    // client was the active driver, the most-recent surviving actor takes
    // the floor.
    for (const ptyId of ptysWithSurvivingPeers) {
      const driver = this.getDriver(ptyId)
      if (driver.kind !== 'mobile' || driver.clientId !== clientId) {
        continue
      }
      const subscribers = this.terminalSessions.listMobileSubscribers(ptyId)
      const next = this.pickMostRecentActor(subscribers)
      if (!next) {
        continue
      }
      this.setDriver(ptyId, { kind: 'mobile', clientId: next.clientId })

      const mode = this.getMobileDisplayMode(ptyId)
      if (mode === 'desktop') {
        continue
      }
      const nextSub = this.terminalSessions.getMobileSubscriber(ptyId, next.clientId)
      const nextViewport = nextSub?.viewport
      if (!nextViewport) {
        continue
      }
      void this.enqueueLayout(ptyId, {
        kind: 'phone',
        cols: nextViewport.cols,
        rows: nextViewport.rows,
        ownerClientId: next.clientId
      })
    }

    // (5) Legacy-callers fallback. Older mobile builds use resizeForClient
    // directly and never populate mobileSubscribers. For those PTYs the
    // override carries the owning clientId; restore the layout when the
    // owner disconnects. resolveDesktopRestoreTarget reads lastRendererSizes
    // (which the legacy mobile-fit branch stashes the pre-fit size into).
    for (const [ptyId, override] of this.terminalSessions.getFitOverrides()) {
      if (override.clientId !== clientId) {
        continue
      }
      if (this.terminalSessions.hasMobileSubscribers(ptyId)) {
        continue
      }
      const cur = this.terminalSessions.getLayout(ptyId)
      if (cur?.kind !== 'phone') {
        continue
      }
      // Why: Indefinite hold gate — see soft-leaver branch above. Legacy
      // mobile clients (resizeForClient path) honor the same setting.
      if (this.getAutoRestoreFitMs() == null) {
        continue
      }
      const fallback = this.resolveDesktopRestoreTarget(ptyId)
      const cols = override.previousCols ?? fallback.cols
      const rows = override.previousRows ?? fallback.rows
      void this.enqueueLayout(ptyId, { kind: 'desktop', cols, rows })
    }
  }
}
