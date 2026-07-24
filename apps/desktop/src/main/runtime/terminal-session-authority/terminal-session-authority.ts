import type { RuntimeTerminalDriverState } from '../../../shared/runtime-types'
import {
  TerminalSessionEvents,
  type TerminalDataMeta,
  type TerminalFitEvent,
  type TerminalResizeEvent
} from './terminal-session-events'
import type {
  TerminalSessionGraphPort,
  TerminalSessionHandleRecord,
  TerminalSessionLeaf,
  TerminalSessionTab
} from './terminal-session-graph'
import type {
  TerminalFitOverride,
  TerminalLayoutResult,
  TerminalLayoutState,
  TerminalLayoutTarget
} from './terminal-session-layout-types'
import { TerminalSessionLayouts, type TerminalSessionLayoutPort } from './terminal-session-layouts'
import { TerminalSessionPresenceAuthority } from './terminal-session-presence-authority'
import type { TerminalSessionPtyRecord } from './terminal-session-record-registry'
import { TerminalSessionSubscriptions } from './terminal-session-subscriptions'

type SubscriptionCleanup = () => void | Promise<void>

export type TerminalSessionAuthorityPort = TerminalSessionLayoutPort &
  TerminalSessionGraphPort & {
    notifyRemoteViewPresence(ptyId: string): void
    notifyDriverChanged(ptyId: string, driver: RuntimeTerminalDriverState): void
  }

export class TerminalSessionAuthority<
  TTab extends TerminalSessionTab,
  TLeaf extends TerminalSessionLeaf,
  TPty extends TerminalSessionPtyRecord,
  THandle extends TerminalSessionHandleRecord,
  TEmulator,
  TTerminalWaiter extends { handle: string },
  TMessageWaiter extends { handle: string }
> extends TerminalSessionPresenceAuthority<
  TTab,
  TLeaf,
  TPty,
  THandle,
  TEmulator,
  TTerminalWaiter,
  TMessageWaiter
> {
  private readonly subscriptions = new TerminalSessionSubscriptions()
  private readonly events: TerminalSessionEvents
  private readonly layouts: TerminalSessionLayouts
  constructor(port: TerminalSessionAuthorityPort) {
    super(port)
    this.events = new TerminalSessionEvents(port)
    this.layouts = new TerminalSessionLayouts(port, this.events, (ptyId) =>
      this.getMobileRestoreBaseline(ptyId)
    )
  }

  beginMobileInputFloor(
    ptyId: string,
    clientId: string,
    commit: (previousFloor: RuntimeTerminalDriverState, isCurrent: () => boolean) => Promise<void>
  ): { commit: () => Promise<void>; rollback: () => void } | null {
    if (!this.canMobileClientTakeFloor(ptyId, clientId)) {
      return null
    }
    return this.reserveMobileInputFloor(ptyId, clientId, {
      getDriver: () => this.events.getDriver(ptyId),
      setDriver: (driver) => this.events.setDriver(ptyId, driver),
      commit
    })
  }

  markMobileActorAndTakeDriver(ptyId: string, clientId: string): void {
    this.markMobileActor(ptyId, clientId)
    this.events.setDriver(ptyId, { kind: 'mobile', clientId })
  }

  subscribeToData(
    ptyId: string,
    listener: (data: string, meta?: TerminalDataMeta) => void
  ): () => void {
    return this.events.subscribeData(ptyId, listener)
  }

  emitData(ptyId: string, data: string, meta?: TerminalDataMeta): void {
    this.events.emitData(ptyId, data, meta)
  }

  subscribeToFit(ptyId: string, listener: (event: TerminalFitEvent) => void): () => void {
    return this.events.subscribeFit(ptyId, listener)
  }

  emitFit(ptyId: string, event: TerminalFitEvent): void {
    this.events.emitFit(ptyId, event)
  }

  subscribeToDriver(
    ptyId: string,
    listener: (driver: RuntimeTerminalDriverState) => void
  ): () => void {
    return this.events.subscribeDriver(ptyId, listener)
  }

  getDriver(ptyId: string): RuntimeTerminalDriverState {
    return this.events.getDriver(ptyId)
  }

  getDrivers(): Map<string, RuntimeTerminalDriverState> {
    return this.events.getDrivers()
  }

  setDriver(ptyId: string, driver: RuntimeTerminalDriverState): void {
    this.events.setDriver(ptyId, driver)
  }

  subscribeToResize(ptyId: string, listener: (event: TerminalResizeEvent) => void): () => void {
    return this.events.subscribeResize(ptyId, listener)
  }

  emitResize(ptyId: string, event: TerminalResizeEvent): void {
    this.events.emitResize(ptyId, event)
  }

  registerRemoteView(ptyId: string): () => void {
    return this.events.registerRemoteView(ptyId)
  }

  hasRemoteView(ptyId: string): boolean {
    return this.events.hasRemoteView(ptyId) || this.hasMobileSubscribers(ptyId)
  }

  getLayout(ptyId: string): TerminalLayoutState | null {
    return this.layouts.getLayout(ptyId)
  }

  hasLayout(ptyId: string): boolean {
    return this.layouts.hasLayout(ptyId)
  }

  enqueueLayout(
    ptyId: string,
    target: TerminalLayoutTarget,
    allowInitial = false
  ): Promise<TerminalLayoutResult> {
    return this.layouts.enqueue(ptyId, target, allowInitial)
  }

  getFitOverride(ptyId: string): TerminalFitOverride | null {
    return this.layouts.getFitOverride(ptyId)
  }

  getFitOverrides(): Map<string, TerminalFitOverride> {
    return this.layouts.getFitOverrides()
  }

  hasFitOverride(ptyId: string): boolean {
    return this.layouts.hasFitOverride(ptyId)
  }

  releaseFitOverride(ptyId: string): boolean {
    return this.layouts.releaseFitOverride(ptyId)
  }

  setLastRendererSize(ptyId: string, cols: number, rows: number): void {
    this.layouts.setLastRendererSize(ptyId, cols, rows)
  }

  getLastRendererSize(ptyId: string): { cols: number; rows: number } | null {
    return this.layouts.getLastRendererSize(ptyId)
  }

  resolveDesktopRestoreTarget(ptyId: string): { cols: number; rows: number } {
    return this.layouts.resolveDesktopRestoreTarget(ptyId)
  }

  isResizeSuppressed(): boolean {
    return this.layouts.isResizeSuppressed()
  }

  exitPtySession(
    ptyId: string,
    exitCode: number
  ): { handle: string | null; pty: TPty | null; leaves: TLeaf[] } {
    this.clearPresenceForPty(ptyId)
    this.events.clearPtyTransientState(ptyId)
    this.layouts.clearPty(ptyId)
    this.events.clearDriver(ptyId)
    return this.markPtyExited(ptyId, exitCode)
  }

  registerSubscription(
    subscriptionId: string,
    cleanup: SubscriptionCleanup,
    connectionId?: string
  ): void {
    this.subscriptions.register(subscriptionId, cleanup, connectionId)
  }

  cleanupSubscription(subscriptionId: string): void {
    this.subscriptions.cleanup(subscriptionId)
  }

  cleanupSubscriptionAndWait(subscriptionId: string): Promise<void> {
    return this.subscriptions.cleanupAndWait(subscriptionId)
  }

  retrySubscriptionCleanupAfter(
    subscriptionId: string,
    cleanupOwner: SubscriptionCleanup,
    gate: Promise<void>
  ): void {
    this.subscriptions.retryAfter(subscriptionId, cleanupOwner, gate)
  }

  cleanupSubscriptionsByPrefix(prefix: string): void {
    this.subscriptions.cleanupByPrefix(prefix)
  }

  cleanupSubscriptionsForConnection(connectionId: string): void {
    this.subscriptions.cleanupConnection(connectionId)
  }
}
