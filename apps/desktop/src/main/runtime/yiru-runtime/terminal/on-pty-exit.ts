import { advertisedUrlWatcher } from '~main/ports/advertised-url-watcher'

import type { DriverState, PtyLayoutTarget } from '../model/worktree-resolution'
import { RuntimeTerminalOnClientDisconnected } from './on-client-disconnected'

export abstract class RuntimeTerminalOnPtyExit extends RuntimeTerminalOnClientDisconnected {
  onPtyExit(ptyId: string, exitCode: number): void {
    advertisedUrlWatcher.unbindPty(ptyId)
    const exited = this.terminalSessions.exitPtySession(ptyId, exitCode)
    this.recentPtyOutputById.delete(ptyId)
    this.setupCompletionTokenByPtyId.delete(ptyId)
    this.clearWaitBlockedCheckState(ptyId)
    this.recentPtyPathCandidatesById.delete(ptyId)
    this.ptyOutputSequenceById.delete(ptyId)
    this.ptyWireByteSequenceById.delete(ptyId)
    this.ptyTransportGenerationById.delete(ptyId)
    this.providerSequenceInitializedPtys.delete(ptyId)
    this.providerSequenceOffsetByPtyId.delete(ptyId)
    this.providerSnapshotPreferredPtys.delete(ptyId)
    this.providerModeTrackersByPtyId.delete(ptyId)
    this.providerModeSnapshotScansByPtyId.delete(ptyId)
    this.agentStatusOscProcessorsByPtyId.delete(ptyId)
    this.terminalSpawnCommandsByPtyId.delete(ptyId)
    this.disposePtyTitleTracker(ptyId)
    this.oscTitleScanTailByPtyId.delete(ptyId)
    this.osc7ScanTailByPtyId.delete(ptyId)
    this.terminalCwdByPtyId.delete(ptyId)
    this.terminalFileUriHostnameByPtyId.delete(ptyId)
    this.clearAgentRowSnapshotsForPty(ptyId)
    // Why: a Claude agent-team leader whose PTY exits naturally (agent finished,
    // process died, renderer reload) must release its team + nested panes map.
    // Previously only explicit closeTerminal evicted it, so natural exits leaked
    // one team per never-reused teamId for the runtime's lifetime.
    if (exited.handle) {
      this.claudeAgentTeams.removeTeamForLeaderHandle(exited.handle)
    }
    this.disposeHeadlessTerminal(ptyId)
    this.agentDetector?.onExit(ptyId)
    if (exited.pty) {
      this.resolvePtyExitWaiters(exited.pty, ptyId)
      this.pruneDisconnectedPtyTranscript(exited.pty)
      this.terminalSessions.commitPtyState(ptyId, { pty: exited.pty })
      this.touchMobileSessionSnapshotsForPty(ptyId, { immediate: true })
    }

    for (const leaf of exited.leaves) {
      this.resolveExitWaiters(leaf)
      this.failActiveDispatchOnExit(leaf, exitCode)
    }
    this.pruneDisconnectedPtyRecords()
  }

  // ─── Driver state (mobile-presence lock) ──────────────────────────
  //
  // See docs/mobile-presence-lock.md.

  getDriver(ptyId: string): DriverState {
    return this.terminalSessions.getDriver(ptyId)
  }

  protected setDriver(ptyId: string, next: DriverState): void {
    this.terminalSessions.setDriver(ptyId, next)
  }

  // Why: the host's own fit cascade (window resize, split drag, tab reveal,
  // "+"-new-tab re-render) must not resize a PTY whose width a remote client
  // owns — that is the remote "porridge" bug. True while a phone (mobile driver)
  // OR an active remote desktop viewer owns the PTY. Input is deliberately NOT gated
  // here (see the `writePtyInput` mobile-only checks): shared-control desktop
  // viewers may still type alongside the host.
  // Note: this is intentionally NOT a driver kind. An active remote viewer needs
  // only resize suppression, not the mobile driver machinery (input lock,
  // phone-fit, driver-change banners), so it lives in its own registry and does
  // not perturb the presence-lock state machine. It also coexists with mobile:
  // while a phone drives, the registry still suppresses host resize, and when
  // the phone leaves the surviving viewer keeps the PTY suppressed.

  isPtyResizeDrivenRemotely(ptyId: string): boolean {
    if (this.getDriver(ptyId).kind === 'mobile') {
      return true
    }
    return this.isRemoteDesktopResizeDriven(ptyId)
  }

  isRemoteDesktopResizeDriven(ptyId: string): boolean {
    return Boolean(this.terminalSessions.getRemoteDesktopOwner(ptyId))
  }

  isRemoteDesktopViewerOwner(ptyId: string, subscriptionKey: string): boolean {
    return this.terminalSessions.getRemoteDesktopOwner(ptyId) === subscriptionKey
  }

  getRemoteDesktopFitHold(
    ptyId: string,
    subscriptionKey: string
  ): { mode: 'remote-desktop-fit' | 'desktop-fit'; cols: number; rows: number } {
    const size = this.getTerminalSize(ptyId) ?? { cols: 0, rows: 0 }
    const owner = this.terminalSessions.getRemoteDesktopOwner(ptyId)
    const isViewer = Boolean(this.terminalSessions.getRemoteDesktopViewer(ptyId, subscriptionKey))
    return {
      // Why: after the host reclaims, connected viewers remain parked at the
      // host grid so their next input/resize can explicitly claim it again.
      mode: owner === subscriptionKey || !isViewer ? 'desktop-fit' : 'remote-desktop-fit',
      ...size
    }
  }

  protected hasRemoteDesktopViewers(ptyId: string): boolean {
    return this.terminalSessions.hasRemoteDesktopViewers(ptyId)
  }

  protected activeRemoteDesktopViewport(ptyId: string): { cols: number; rows: number } | null {
    const owner = this.terminalSessions.getRemoteDesktopOwner(ptyId)
    return owner ? this.terminalSessions.getRemoteDesktopViewer(ptyId, owner) : null
  }

  protected resolveRemoteDesktopHostReclaimTarget(ptyId: string): { cols: number; rows: number } {
    const target = this.terminalSessions.getRemoteDesktopHostReclaimTarget(ptyId)
    if (target) {
      return target
    }
    // Why: a viewer can join while a phone owns the actual PTY size. The
    // mobile restore chain retains the pre-phone desktop geometry; current
    // PTY size alone would incorrectly capture the phone grid as host truth.
    return this.resolveDesktopRestoreTarget(ptyId)
  }

  protected ensureRemoteDesktopHostReclaimTarget(ptyId: string): void {
    if (!this.terminalSessions.getRemoteDesktopHostReclaimTarget(ptyId)) {
      this.terminalSessions.setRemoteDesktopHostReclaimTarget(
        ptyId,
        this.resolveRemoteDesktopHostReclaimTarget(ptyId)
      )
    }
  }

  recordRemoteDesktopHostReclaimTarget(ptyId: string, cols: number, rows: number): void {
    // Why: phone presence also suppresses host resize, but must not seed the
    // separate remote-viewer cache when no desktop stream owns a width floor.
    if (!this.terminalSessions.getRemoteDesktopOwner(ptyId) || cols <= 0 || rows <= 0) {
      return
    }
    this.terminalSessions.setRemoteDesktopHostReclaimTarget(ptyId, { cols, rows })
  }

  protected hasRemoteDesktopLayoutState(ptyId: string): boolean {
    return this.terminalSessions.hasRemoteDesktopLayoutState(ptyId)
  }

  protected bumpRemoteDesktopViewerRevision(ptyId: string): number {
    return this.terminalSessions.bumpRemoteDesktopRevision(ptyId)
  }

  async applyRemoteDesktopLayout(ptyId: string): Promise<boolean> {
    if (this.getDriver(ptyId).kind === 'mobile') {
      return true
    }
    const target = this.activeRemoteDesktopViewport(ptyId)
    const reclaimingHost = !target
    const viewerRevision = this.terminalSessions.getRemoteDesktopRevision(ptyId)
    const layoutTarget: PtyLayoutTarget = target
      ? {
          kind: 'remote-desktop',
          cols: target.cols,
          rows: target.rows,
          ownerSubscriptionKey: this.terminalSessions.getRemoteDesktopOwner(ptyId)!
        }
      : { kind: 'desktop', ...this.resolveRemoteDesktopHostReclaimTarget(ptyId) }
    const result = await this.enqueueLayout(ptyId, layoutTarget, true)
    // Why: only drop the recorded host size once the reclaim resize actually
    // landed. If it failed, the PTY is still at the remote-viewer width, so
    // keep the target for the next reclaim (otherwise it resolves via the
    // stale remote width and never restores true host geometry).
    if (
      reclaimingHost &&
      result.ok &&
      !this.terminalSessions.getRemoteDesktopOwner(ptyId) &&
      this.terminalSessions.getRemoteDesktopRevision(ptyId) === viewerRevision
    ) {
      this.terminalSessions.deleteRemoteDesktopHostReclaimTarget(ptyId)
    }
    return result.ok
  }

  // Why: attachment only records geometry. Passive hydration/reconnect must not
  // steal the shared PTY from the desktop where the user is actively working.
}
