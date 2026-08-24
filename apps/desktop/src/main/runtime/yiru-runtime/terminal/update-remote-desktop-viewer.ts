import { clampTerminalViewport } from '../model/review-branch'
import { RuntimeTerminalOnPtyExit } from './on-pty-exit'

export abstract class RuntimeTerminalUpdateRemoteDesktopViewer extends RuntimeTerminalOnPtyExit {
  async updateRemoteDesktopViewer(
    ptyId: string,
    subscriptionKey: string,
    clientId: string,
    cols: number,
    rows: number,
    claim = true
  ): Promise<boolean> {
    const viewport = clampTerminalViewport(cols, rows)
    if (claim) {
      this.ensureRemoteDesktopHostReclaimTarget(ptyId)
    }
    const prior = this.terminalSessions.getRemoteDesktopViewer(ptyId, subscriptionKey)
    if (
      prior &&
      prior.cols === viewport.cols &&
      prior.rows === viewport.rows &&
      (!claim || this.terminalSessions.getRemoteDesktopOwner(ptyId) === subscriptionKey)
    ) {
      if (claim && this.terminalSessions.getRemoteDesktopOwner(ptyId) === subscriptionKey) {
        const size = this.getTerminalSize(ptyId)
        if (size?.cols !== viewport.cols || size.rows !== viewport.rows) {
          return this.applyRemoteDesktopLayout(ptyId)
        }
      }
      return true
    }
    const activity = claim
      ? this.terminalSessions.nextRemoteDesktopActivity()
      : (prior?.activity ?? 0)
    this.terminalSessions.setRemoteDesktopViewer(ptyId, subscriptionKey, {
      clientId,
      cols: viewport.cols,
      rows: viewport.rows,
      activity
    })
    this.bumpRemoteDesktopViewerRevision(ptyId)
    if (claim) {
      this.terminalSessions.setRemoteDesktopOwner(ptyId, subscriptionKey)
      return this.applyRemoteDesktopLayout(ptyId)
    }
    return true
  }

  claimRemoteDesktopViewer(ptyId: string, subscriptionKey: string): Promise<boolean> {
    const viewer = this.terminalSessions.getRemoteDesktopViewer(ptyId, subscriptionKey)
    if (!viewer) {
      return Promise.resolve(false)
    }
    if (this.terminalSessions.getRemoteDesktopOwner(ptyId) === subscriptionKey) {
      const size = this.getTerminalSize(ptyId)
      return size?.cols === viewer.cols && size.rows === viewer.rows
        ? Promise.resolve(true)
        : this.applyRemoteDesktopLayout(ptyId)
    }
    this.ensureRemoteDesktopHostReclaimTarget(ptyId)
    this.terminalSessions.touchRemoteDesktopViewer(ptyId, subscriptionKey)
    this.terminalSessions.setRemoteDesktopOwner(ptyId, subscriptionKey)
    this.bumpRemoteDesktopViewerRevision(ptyId)
    return this.applyRemoteDesktopLayout(ptyId)
  }

  claimRemoteDesktopHost(ptyId: string, cols: number, rows: number): Promise<boolean> {
    if (!this.terminalSessions.getRemoteDesktopOwner(ptyId)) {
      // Why: disconnect can remove the owner before its queued host resize
      // lands. A host input in that window must join the reclaim, not pass it.
      return this.terminalSessions.getRemoteDesktopHostReclaimTarget(ptyId)
        ? this.applyRemoteDesktopLayout(ptyId)
        : Promise.resolve(true)
    }
    const viewport = clampTerminalViewport(cols, rows)
    this.terminalSessions.setRemoteDesktopHostReclaimTarget(ptyId, viewport)
    this.terminalSessions.deleteRemoteDesktopOwner(ptyId)
    this.bumpRemoteDesktopViewerRevision(ptyId)
    return this.applyRemoteDesktopLayout(ptyId)
  }

  unregisterRemoteDesktopViewer(ptyId: string, subscriptionKey: string): Promise<boolean> {
    return this.unregisterRemoteDesktopViewers(ptyId, [subscriptionKey])
  }

  unregisterRemoteDesktopViewers(
    ptyId: string,
    subscriptionKeys: Iterable<string>
  ): Promise<boolean> {
    if (!this.terminalSessions.hasRemoteDesktopViewers(ptyId)) {
      return Promise.resolve(false)
    }
    let changed = false
    let removedOwner = false
    for (const subscriptionKey of subscriptionKeys) {
      removedOwner =
        this.terminalSessions.getRemoteDesktopOwner(ptyId) === subscriptionKey || removedOwner
      changed = this.terminalSessions.deleteRemoteDesktopViewer(ptyId, subscriptionKey) || changed
    }
    if (!changed) {
      return Promise.resolve(false)
    }
    if (removedOwner) {
      let fallback: { key: string; activity: number } | null = null
      for (const [key, viewer] of this.terminalSessions.listRemoteDesktopViewers(ptyId)) {
        if (viewer.activity > 0 && (!fallback || viewer.activity > fallback.activity)) {
          fallback = { key, activity: viewer.activity }
        }
      }
      if (fallback) {
        this.terminalSessions.setRemoteDesktopOwner(ptyId, fallback.key)
      } else {
        this.terminalSessions.deleteRemoteDesktopOwner(ptyId)
      }
    }
    this.bumpRemoteDesktopViewerRevision(ptyId)
    return removedOwner ? this.applyRemoteDesktopLayout(ptyId) : Promise.resolve(true)
  }

  // Why: the one-shot `terminal.updateViewport` RPC has no disconnect hook, so
  // it must never *create* a width floor (that floor would leak — nothing
  // releases it, pinning the host at a stale width after the viewer is gone).
  // It only refreshes the floor(s) this client already owns via its stream
  // subscription, keyed by clientId. Mirrors the mobile `updateMobileViewport`
  // no-op-without-subscription invariant. Returns false when the client owns no
  // floor (passive/stream-less viewer) — a stream-less viewer must not lock host
  // resize.

  refreshRemoteDesktopViewer(
    ptyId: string,
    clientId: string,
    cols: number,
    rows: number,
    claim = false
  ): Promise<boolean> {
    const viewers = this.terminalSessions.listRemoteDesktopViewers(ptyId)
    if (viewers.length === 0) {
      return Promise.resolve(false)
    }
    const viewport = clampTerminalViewport(cols, rows)
    if (claim) {
      // Why: terminal.send may be the first activity while the stream is only
      // passively registered. Snapshot host truth before this refresh owns it.
      this.ensureRemoteDesktopHostReclaimTarget(ptyId)
    }
    let changed = false
    for (const [subscriptionKey, viewer] of viewers) {
      if (viewer.clientId === clientId) {
        const activity = claim ? this.terminalSessions.nextRemoteDesktopActivity() : viewer.activity
        this.terminalSessions.setRemoteDesktopViewer(ptyId, subscriptionKey, {
          ...viewer,
          cols: viewport.cols,
          rows: viewport.rows,
          activity
        })
        if (claim) {
          this.terminalSessions.setRemoteDesktopOwner(ptyId, subscriptionKey)
        }
        changed = true
      }
    }
    if (!changed) {
      return Promise.resolve(false)
    }
    this.bumpRemoteDesktopViewerRevision(ptyId)
    return this.terminalSessions.getRemoteDesktopOwner(ptyId)
      ? this.applyRemoteDesktopLayout(ptyId)
      : Promise.resolve(true)
  }

  async updateDesktopViewport(
    ptyId: string,
    viewport: { cols: number; rows: number }
  ): Promise<boolean> {
    const { cols, rows } = clampTerminalViewport(viewport.cols, viewport.rows)
    if (this.terminalSessions.hasFitOverride(ptyId) || this.getDriver(ptyId).kind === 'mobile') {
      this.recordRendererGeometry(ptyId, cols, rows)
      return true
    }
    if (this.isResizeSuppressed()) {
      return false
    }
    const result = await this.enqueueLayout(ptyId, { kind: 'desktop', cols, rows }, true)
    if (result.ok) {
      this.refreshRendererGeometry(ptyId, cols, rows)
    }
    return result.ok
  }

  markMobileActor(ptyId: string, clientId: string): void {
    this.terminalSessions.markMobileActorAndTakeDriver(ptyId, clientId)
  }
}
