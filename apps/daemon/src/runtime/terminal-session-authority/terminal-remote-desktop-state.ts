import type { TerminalDimensions } from './terminal-session-layout-types'

export type TerminalRemoteDesktopViewer = TerminalDimensions & {
  clientId: string
  activity: number
}

export class TerminalRemoteDesktopState {
  // Why: subscriptions, not clients, own width floors because one client may stream twice.
  private readonly viewers = new Map<string, Map<string, TerminalRemoteDesktopViewer>>()
  private readonly owners = new Map<string, string>()
  private readonly hostReclaimTargets = new Map<string, TerminalDimensions>()
  // Why: revisions stop an older reclaim from consuming a newer viewer's host target.
  private readonly viewerRevisions = new Map<string, number>()
  private activity = 0

  hasViewers(ptyId: string): boolean {
    return (this.viewers.get(ptyId)?.size ?? 0) > 0
  }

  listViewers(ptyId: string): [string, TerminalRemoteDesktopViewer][] {
    return [...(this.viewers.get(ptyId)?.entries() ?? [])].map(([key, viewer]) => [
      key,
      { ...viewer }
    ])
  }

  getViewer(ptyId: string, subscriptionKey: string): TerminalRemoteDesktopViewer | null {
    const viewer = this.viewers.get(ptyId)?.get(subscriptionKey)
    return viewer ? { ...viewer } : null
  }

  setViewer(ptyId: string, subscriptionKey: string, viewer: TerminalRemoteDesktopViewer): void {
    let viewers = this.viewers.get(ptyId)
    if (!viewers) {
      viewers = new Map()
      this.viewers.set(ptyId, viewers)
    }
    viewers.set(subscriptionKey, { ...viewer })
  }

  touchViewer(ptyId: string, subscriptionKey: string): TerminalRemoteDesktopViewer | null {
    const viewer = this.viewers.get(ptyId)?.get(subscriptionKey)
    if (!viewer) {
      return null
    }
    viewer.activity = this.nextActivity()
    return { ...viewer }
  }

  deleteViewer(ptyId: string, subscriptionKey: string): boolean {
    const viewers = this.viewers.get(ptyId)
    const deleted = viewers?.delete(subscriptionKey) ?? false
    if (viewers?.size === 0) {
      this.viewers.delete(ptyId)
    }
    return deleted
  }

  getOwner(ptyId: string): string | null {
    return this.owners.get(ptyId) ?? null
  }

  listOwners(): [string, string][] {
    return [...this.owners.entries()]
  }

  setOwner(ptyId: string, subscriptionKey: string): void {
    this.owners.set(ptyId, subscriptionKey)
  }

  deleteOwner(ptyId: string): void {
    this.owners.delete(ptyId)
  }

  nextActivity(): number {
    this.activity += 1
    return this.activity
  }

  getHostReclaimTarget(ptyId: string): TerminalDimensions | null {
    const target = this.hostReclaimTargets.get(ptyId)
    return target ? { ...target } : null
  }

  setHostReclaimTarget(ptyId: string, target: TerminalDimensions): void {
    this.hostReclaimTargets.set(ptyId, { ...target })
  }

  deleteHostReclaimTarget(ptyId: string): void {
    this.hostReclaimTargets.delete(ptyId)
  }

  getRevision(ptyId: string): number {
    return this.viewerRevisions.get(ptyId) ?? 0
  }

  bumpRevision(ptyId: string): number {
    const revision = this.getRevision(ptyId) + 1
    this.viewerRevisions.set(ptyId, revision)
    return revision
  }

  hasLayoutState(ptyId: string): boolean {
    return this.owners.has(ptyId) || this.hostReclaimTargets.has(ptyId)
  }

  clearPty(ptyId: string): void {
    this.viewers.delete(ptyId)
    this.owners.delete(ptyId)
    this.hostReclaimTargets.delete(ptyId)
    this.viewerRevisions.delete(ptyId)
  }
}
