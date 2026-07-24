import type { RuntimeTerminalDriverState } from '../../../shared/runtime-types'
import {
  TerminalMobileSessionState,
  type TerminalMobileRestoreTimer,
  type TerminalMobileSoftLeaver,
  type TerminalMobileSubscriber
} from './terminal-mobile-session-state'
import {
  TerminalRemoteDesktopState,
  type TerminalRemoteDesktopViewer
} from './terminal-remote-desktop-state'
import type {
  TerminalSessionGraphPort,
  TerminalSessionHandleRecord,
  TerminalSessionLeaf,
  TerminalSessionTab
} from './terminal-session-graph'
import type { TerminalDimensions } from './terminal-session-layout-types'
import type { TerminalSessionPtyRecord } from './terminal-session-record-registry'
import { TerminalSessionRuntimeState } from './terminal-session-runtime-state'

export class TerminalSessionPresenceAuthority<
  TTab extends TerminalSessionTab,
  TLeaf extends TerminalSessionLeaf,
  TPty extends TerminalSessionPtyRecord,
  THandle extends TerminalSessionHandleRecord,
  TEmulator,
  TTerminalWaiter extends { handle: string },
  TMessageWaiter extends { handle: string }
> extends TerminalSessionRuntimeState<
  TTab,
  TLeaf,
  TPty,
  THandle,
  TEmulator,
  TTerminalWaiter,
  TMessageWaiter
> {
  private readonly mobile = new TerminalMobileSessionState()
  private readonly remoteDesktop = new TerminalRemoteDesktopState()

  constructor(port: TerminalSessionGraphPort) {
    super(port)
  }

  protected reserveMobileInputFloor(
    ptyId: string,
    clientId: string,
    port: {
      getDriver(): RuntimeTerminalDriverState
      setDriver(driver: RuntimeTerminalDriverState): void
      commit(previousFloor: RuntimeTerminalDriverState, isCurrent: () => boolean): Promise<void>
    }
  ): { commit: () => Promise<void>; rollback: () => void } {
    return this.mobile.beginInputFloor(ptyId, clientId, port)
  }

  protected canMobileClientTakeFloor(ptyId: string, clientId: string): boolean {
    return (
      this.mobile.getSubscriber(ptyId, clientId) !== null ||
      this.mobile.getSoftLeaver(ptyId)?.clientId === clientId
    )
  }

  protected getMobileRestoreBaseline(
    ptyId: string
  ): { previousCols: number; previousRows: number } | null {
    let earliest: {
      subscribedAt: number
      previousCols: number
      previousRows: number
    } | null = null
    for (const subscriber of this.mobile.listSubscribers(ptyId)) {
      if (subscriber.previousCols == null || subscriber.previousRows == null) {
        continue
      }
      if (!earliest || subscriber.subscribedAt < earliest.subscribedAt) {
        earliest = {
          subscribedAt: subscriber.subscribedAt,
          previousCols: subscriber.previousCols,
          previousRows: subscriber.previousRows
        }
      }
    }
    return earliest
      ? { previousCols: earliest.previousCols, previousRows: earliest.previousRows }
      : null
  }

  getMobileDisplayMode(ptyId: string): 'auto' | 'desktop' {
    return this.mobile.getDisplayMode(ptyId)
  }

  setMobileDisplayMode(ptyId: string, mode: 'auto' | 'desktop'): void {
    this.mobile.setDisplayMode(ptyId, mode)
  }

  hasMobileSubscribers(ptyId: string): boolean {
    return this.mobile.hasSubscribers(ptyId)
  }

  listMobileSubscribers(ptyId: string): TerminalMobileSubscriber[] {
    return this.mobile.listSubscribers(ptyId)
  }

  getMobileSubscriber(ptyId: string, clientId: string): TerminalMobileSubscriber | null {
    return this.mobile.getSubscriber(ptyId, clientId)
  }

  setMobileSubscriber(ptyId: string, subscriber: TerminalMobileSubscriber): void {
    this.mobile.setSubscriber(ptyId, subscriber)
  }

  deleteMobileSubscriber(ptyId: string, clientId: string): TerminalMobileSubscriber | null {
    return this.mobile.deleteSubscriber(ptyId, clientId)
  }

  deleteMobileSubscribers(ptyId: string): void {
    this.mobile.deleteSubscribers(ptyId)
  }

  markMobileActor(ptyId: string, clientId: string): boolean {
    return this.mobile.markActor(ptyId, clientId)
  }

  setMobileViewport(ptyId: string, clientId: string, viewport: TerminalDimensions): boolean {
    return this.mobile.setViewport(ptyId, clientId, viewport)
  }

  recordMobileViewportActivity(
    ptyId: string,
    clientId: string,
    viewport: TerminalDimensions
  ): boolean {
    return this.mobile.recordViewportActivity(ptyId, clientId, viewport)
  }

  setMobilePhoneFit(ptyId: string, clientId: string, fitted: boolean): boolean {
    return this.mobile.setPhoneFit(ptyId, clientId, fitted)
  }

  clearMobilePhoneFits(ptyId: string): string[] {
    return this.mobile.clearPhoneFits(ptyId)
  }

  restoreMobilePhoneFits(ptyId: string, clientIds: Iterable<string>): void {
    this.mobile.restorePhoneFits(ptyId, clientIds)
  }

  donateMobileRestoreBaseline(ptyId: string, baseline: TerminalDimensions): boolean {
    return this.mobile.donateRestoreBaseline(ptyId, baseline)
  }

  refreshMobileRestoreBaselines(ptyId: string, dimensions: TerminalDimensions): void {
    this.mobile.refreshRestoreBaselines(ptyId, dimensions)
  }

  getMobileSoftLeaver(ptyId: string): TerminalMobileSoftLeaver | null {
    return this.mobile.getSoftLeaver(ptyId)
  }

  setMobileSoftLeaver(ptyId: string, leaver: TerminalMobileSoftLeaver): void {
    this.mobile.setSoftLeaver(ptyId, leaver)
  }

  takeMobileSoftLeaver(ptyId: string): TerminalMobileSoftLeaver | null {
    return this.mobile.takeSoftLeaver(ptyId)
  }

  cancelMobileSoftLeaver(ptyId: string): void {
    this.mobile.cancelSoftLeaver(ptyId)
  }

  setMobileRestoreTimer(ptyId: string, entry: TerminalMobileRestoreTimer): void {
    this.mobile.setRestoreTimer(ptyId, entry)
  }

  cancelMobileRestoreTimer(ptyId: string): void {
    this.mobile.cancelRestoreTimer(ptyId)
  }

  clearMobileRestoreTimer(ptyId: string): void {
    this.mobile.clearRestoreTimer(ptyId)
  }

  cancelAllMobileRestoreTimers(): void {
    this.mobile.cancelAllRestoreTimers()
  }

  cancelMobileRestoreTimersForClient(clientId: string): void {
    this.mobile.cancelRestoreTimersForClient(clientId)
  }

  takeMobileSoftLeaversForClient(clientId: string): [string, TerminalMobileSoftLeaver][] {
    return this.mobile.takeSoftLeaversForClient(clientId)
  }

  disconnectMobileClient(clientId: string): {
    ptyId: string
    subscriber: TerminalMobileSubscriber
    hasSurvivors: boolean
  }[] {
    return this.mobile.disconnectClient(clientId)
  }

  hasRemoteDesktopViewers(ptyId: string): boolean {
    return this.remoteDesktop.hasViewers(ptyId)
  }

  listRemoteDesktopViewers(ptyId: string): [string, TerminalRemoteDesktopViewer][] {
    return this.remoteDesktop.listViewers(ptyId)
  }

  getRemoteDesktopViewer(
    ptyId: string,
    subscriptionKey: string
  ): TerminalRemoteDesktopViewer | null {
    return this.remoteDesktop.getViewer(ptyId, subscriptionKey)
  }

  setRemoteDesktopViewer(
    ptyId: string,
    subscriptionKey: string,
    viewer: TerminalRemoteDesktopViewer
  ): void {
    this.remoteDesktop.setViewer(ptyId, subscriptionKey, viewer)
  }

  touchRemoteDesktopViewer(
    ptyId: string,
    subscriptionKey: string
  ): TerminalRemoteDesktopViewer | null {
    return this.remoteDesktop.touchViewer(ptyId, subscriptionKey)
  }

  deleteRemoteDesktopViewer(ptyId: string, subscriptionKey: string): boolean {
    return this.remoteDesktop.deleteViewer(ptyId, subscriptionKey)
  }

  getRemoteDesktopOwner(ptyId: string): string | null {
    return this.remoteDesktop.getOwner(ptyId)
  }

  listRemoteDesktopOwners(): [string, string][] {
    return this.remoteDesktop.listOwners()
  }

  setRemoteDesktopOwner(ptyId: string, subscriptionKey: string): void {
    this.remoteDesktop.setOwner(ptyId, subscriptionKey)
  }

  deleteRemoteDesktopOwner(ptyId: string): void {
    this.remoteDesktop.deleteOwner(ptyId)
  }

  nextRemoteDesktopActivity(): number {
    return this.remoteDesktop.nextActivity()
  }

  getRemoteDesktopHostReclaimTarget(ptyId: string): TerminalDimensions | null {
    return this.remoteDesktop.getHostReclaimTarget(ptyId)
  }

  setRemoteDesktopHostReclaimTarget(ptyId: string, target: TerminalDimensions): void {
    this.remoteDesktop.setHostReclaimTarget(ptyId, target)
  }

  deleteRemoteDesktopHostReclaimTarget(ptyId: string): void {
    this.remoteDesktop.deleteHostReclaimTarget(ptyId)
  }

  getRemoteDesktopRevision(ptyId: string): number {
    return this.remoteDesktop.getRevision(ptyId)
  }

  bumpRemoteDesktopRevision(ptyId: string): number {
    return this.remoteDesktop.bumpRevision(ptyId)
  }

  hasRemoteDesktopLayoutState(ptyId: string): boolean {
    return this.remoteDesktop.hasLayoutState(ptyId)
  }

  clearPresenceForPty(ptyId: string): void {
    this.mobile.clearPty(ptyId)
    this.remoteDesktop.clearPty(ptyId)
  }
}
