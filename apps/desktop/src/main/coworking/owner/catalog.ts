import type { CoworkingRemoteDesktop } from '~shared/coworking/catalog-contract'
import type {
  CoworkingRequesterControlView,
  CoworkingRequesterInvokeArgs,
  CoworkingRequesterSubscriptionArgs
} from '~shared/coworking/ipc-contract'

import {
  cancelCoworkingCatalogSessionLoad,
  reconcileCoworkingCatalogSessionLoad
} from '../catalog/session-loader'
import { isCoworkingDesktopCatalog } from '../catalog/wire-validation'
import { ensureCoworkingControlSubscription } from '../control-subscription'
import { CoworkingPeerConnection } from '../peer/connection'
import type { CoworkingSubscription } from '../peer/connection-contract'
import type { CoworkingProbeClient } from '../probe-client'
import type { DiscoveredCoworkingDesktop, TailnetPeerDirectory } from '../tailnet-peer-directory'
import {
  createCoworkingOwnerRecord,
  projectCoworkingRemoteDesktop,
  coworkingOwnerHasWorktree,
  type CoworkingOwnerRecord
} from './record'
import {
  bindCoworkingRequesterConnection,
  invokeCoworkingRequesterConnection,
  subscribeCoworkingRequesterConnection,
  type CoworkingRequesterSubscriptionSink
} from './requester-transport'

const RECONNECT_DELAY_MS = 2_000

export type CoworkingOwnerCatalogSnapshot = {
  desktops: readonly CoworkingRemoteDesktop[]
  controlStates: readonly CoworkingRequesterControlView[]
}

export type { CoworkingRequesterSubscriptionSink } from './requester-transport'

export class CoworkingOwnerCatalog {
  private readonly records = new Map<string, CoworkingOwnerRecord>()
  private readonly listeners = new Set<(snapshot: CoworkingOwnerCatalogSnapshot) => void>()
  private unsubscribeDirectory: (() => void) | null = null
  private started = false

  constructor(
    private readonly directory: TailnetPeerDirectory,
    private readonly probeClient: CoworkingProbeClient
  ) {}

  snapshot(): CoworkingOwnerCatalogSnapshot {
    const desktops = [...this.records.values()].map(projectCoworkingRemoteDesktop)
    const controlStates = [...this.records.values()].flatMap((record) => [
      ...record.controlStates.values()
    ])
    return { desktops, controlStates }
  }

  subscribe(listener: (snapshot: CoworkingOwnerCatalogSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot())
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (this.started) {
      return
    }
    this.started = true
    this.unsubscribeDirectory = this.directory.subscribe((desktops) =>
      this.reconcileDirectory(desktops)
    )
    this.directory.start()
  }

  stop(): void {
    this.started = false
    this.unsubscribeDirectory?.()
    this.unsubscribeDirectory = null
    this.directory.stop()
    for (const record of this.records.values()) {
      this.disposeConnection(record)
    }
    this.records.clear()
    this.emit()
  }

  async requestControl(desktopRef: string, worktreeRef: string): Promise<void> {
    const record = this.records.get(desktopRef)
    if (
      !record?.connection ||
      record.status !== 'connected' ||
      !coworkingOwnerHasWorktree(record, worktreeRef)
    ) {
      throw new Error('resource_unavailable')
    }
    ensureCoworkingControlSubscription(record, worktreeRef, () => this.emit())
    await record.connection.request('control.request', { worktreeRef }, { mutation: true })
  }

  async invokeRequester(args: CoworkingRequesterInvokeArgs): Promise<unknown> {
    return await invokeCoworkingRequesterConnection(
      args,
      bindCoworkingRequesterConnection(this.records, args)
    )
  }

  subscribeRequester(
    args: CoworkingRequesterSubscriptionArgs,
    sink: CoworkingRequesterSubscriptionSink
  ): CoworkingSubscription {
    return subscribeCoworkingRequesterConnection(
      args,
      bindCoworkingRequesterConnection(this.records, args),
      sink
    )
  }

  private reconcileDirectory(desktops: readonly DiscoveredCoworkingDesktop[]): void {
    const desired = new Set(desktops.map((desktop) => desktop.desktopRef))
    for (const descriptor of desktops) {
      const existing = this.records.get(descriptor.desktopRef)
      if (existing) {
        existing.descriptor = descriptor
      } else {
        const record = createCoworkingOwnerRecord(descriptor)
        this.records.set(descriptor.desktopRef, record)
        void this.connect(record)
      }
    }
    for (const [desktopRef, record] of this.records) {
      if (!desired.has(desktopRef)) {
        this.disposeConnection(record)
        this.records.delete(desktopRef)
      }
    }
    this.emit()
  }

  private async connect(record: CoworkingOwnerRecord): Promise<void> {
    if (!this.started || record.connection) {
      return
    }
    record.connectionGeneration++
    const generation = record.connectionGeneration
    record.connectionEpoch++
    record.status = 'connecting'
    this.emit()
    try {
      const admission = await this.probeClient.probe(record.descriptor.address)
      if (!this.started || generation !== record.connectionGeneration) {
        return
      }
      if (
        admission.response.ownerRuntimeId !== record.descriptor.ownerRuntimeId ||
        admission.response.ownerKeyFingerprint !== record.descriptor.ownerKeyFingerprint
      ) {
        throw new Error('coworking_owner_identity_changed')
      }
      const connection = new CoworkingPeerConnection(admission)
      record.connection = connection
      record.unsubscribeState = connection.subscribeState((state) => {
        if (state.status === 'disconnected') {
          this.handleConnectionLoss(record, connection)
        }
      })
      await connection.connect()
      if (record.connection !== connection) {
        connection.close()
        return
      }
      record.status = 'connected'
      this.openCatalogSubscription(record, connection)
      this.emit()
    } catch {
      if (generation === record.connectionGeneration) {
        this.handleConnectionLoss(record, record.connection)
      }
    }
  }

  private openCatalogSubscription(
    record: CoworkingOwnerRecord,
    connection: CoworkingPeerConnection
  ): void {
    const subscription = connection.subscribe<unknown>(
      'catalog.subscribe',
      {},
      {
        next: (value) => {
          if (!isCoworkingDesktopCatalog(value, record.descriptor.ownerRuntimeId)) {
            throw new Error('invalid_coworking_catalog')
          }
          this.loadCatalogSessions(record, connection, value)
        },
        error: () => this.handleCatalogSubscriptionLoss(record, connection),
        complete: () => this.handleCatalogSubscriptionLoss(record, connection)
      }
    )
    if (record.connection === connection && record.status === 'connected') {
      record.catalogSubscription = subscription
    } else {
      subscription.close()
    }
  }

  private loadCatalogSessions(
    record: CoworkingOwnerRecord,
    connection: CoworkingPeerConnection,
    catalog: NonNullable<CoworkingOwnerRecord['catalog']>
  ): void {
    reconcileCoworkingCatalogSessionLoad({
      record,
      connection,
      catalog,
      isConnected: () =>
        this.records.get(record.descriptor.desktopRef) === record &&
        record.connection === connection &&
        record.status === 'connected',
      onCatalogChanged: () => {
        this.pruneControlSubscriptions(record)
        this.emit()
      }
    })
  }

  private handleCatalogSubscriptionLoss(
    record: CoworkingOwnerRecord,
    connection: CoworkingPeerConnection
  ): void {
    if (record.connection === connection && record.status === 'connected') {
      // Why: a lost catalog stream cannot leave stale Public metadata visible.
      this.handleConnectionLoss(record, connection)
    }
  }

  private pruneControlSubscriptions(record: CoworkingOwnerRecord): void {
    const worktreeRefs = new Set(
      record.catalog?.projects.flatMap((project) =>
        project.worktrees.map((worktree) => worktree.worktreeRef)
      ) ?? []
    )
    for (const [worktreeRef, subscription] of record.controlSubscriptions) {
      if (!worktreeRefs.has(worktreeRef)) {
        subscription.close()
        record.controlSubscriptions.delete(worktreeRef)
        record.controlStates.delete(worktreeRef)
      }
    }
  }

  private handleConnectionLoss(
    record: CoworkingOwnerRecord,
    connection: CoworkingPeerConnection | null
  ): void {
    if (connection && record.connection !== connection) {
      return
    }
    this.disposeConnection(record)
    record.connectionEpoch++
    record.status = 'disconnected'
    record.catalog = null
    record.controlStates.clear()
    this.emit()
    if (this.started && this.records.has(record.descriptor.desktopRef)) {
      record.reconnectTimer = setTimeout(() => {
        record.reconnectTimer = null
        void this.connect(record)
      }, RECONNECT_DELAY_MS)
    }
  }

  private disposeConnection(record: CoworkingOwnerRecord): void {
    record.connectionGeneration++
    cancelCoworkingCatalogSessionLoad(record)
    if (record.reconnectTimer) {
      clearTimeout(record.reconnectTimer)
      record.reconnectTimer = null
    }
    record.unsubscribeState?.()
    record.unsubscribeState = null
    const connection = record.connection
    record.connection = null
    record.catalogSubscription?.close()
    record.catalogSubscription = null
    for (const subscription of record.controlSubscriptions.values()) {
      subscription.close()
    }
    record.controlSubscriptions.clear()
    for (const subscription of record.requesterSubscriptions) {
      subscription.close()
    }
    record.requesterSubscriptions.clear()
    connection?.close()
  }

  private emit(): void {
    const snapshot = this.snapshot()
    for (const listener of this.listeners) {
      listener(snapshot)
    }
  }
}
