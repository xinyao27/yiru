import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import type { MachineBrowserReady } from '@yiru/runtime-protocol/web-connect'
import type { RuntimeMethodContract } from '@yiru/runtime-protocol/workbench/runtime-method-contract'

import { publicKeyFromBase64 } from '../e2ee'
import type { WebRuntimeOrpcClient, WebRuntimeOrpcConnection } from '../orpc-channel'
import type { WebPairingOffer } from '../pairing'
import type { WebShellServicesChannel } from '../shell-services-channel'
import type { WebTerminalMultiplexSubscription } from '../terminal-multiplex-subscription'
import type {
  WebRuntimeConnectionState,
  PendingRequest,
  SubscriptionCallbacks,
  RuntimeSubscription,
  WebRuntimeSubscriptionHandle,
  SubscribeOptions,
  WebRuntimeClientOptions,
  PreparedRelayConnection
} from './state'

export abstract class WebRuntimeClientContract {
  protected ws: WebSocket | null = null
  protected sharedKey: Uint8Array | null = null
  protected state: WebRuntimeConnectionState = 'disconnected'
  protected requestCounter = 0
  protected reconnectAttempt = 0
  protected intentionallyClosed = false
  protected connectTimer: number | null = null
  protected handshakeTimer: number | null = null
  protected reconnectTimer: number | null = null
  protected heartbeatTimer: number | null = null
  protected lastInboundFrameAt = 0
  // Why: timestamp of an outstanding liveness probe (null = none in flight).
  // The dead-close fires only when a SENT probe goes unanswered, never on raw
  // silence, so a hidden/frozen tab resuming after a long gap re-probes first.
  protected heartbeatProbeSentAt: number | null = null
  // Why: detect a suspended tick loop (backgrounded/frozen tab). If a tick lands
  // far later than scheduled, treat the gap as "no evidence", reset the clocks,
  // and re-probe instead of closing.
  protected lastHeartbeatTickAt = 0
  protected readonly pending = new Map<string, PendingRequest>()
  protected readonly subscriptions = new Map<string, RuntimeSubscription>()
  protected readonly fileWatchTeardownRetries = new Map<string, Set<() => Promise<void>>>()
  protected readonly childClients = new Set<WebRuntimeClientContract>()
  protected readonly waiters: { resolve: () => void; reject: (error: Error) => void }[] = []
  protected readonly serverPublicKey: Uint8Array | null
  protected relayDeviceToken: string | null = null
  protected preparedRelay: PreparedRelayConnection | null = null
  protected orpcConnection: WebRuntimeOrpcConnection | null = null
  protected legacyOrpcClient: WebRuntimeOrpcClient | null = null
  protected orpcClientPromise: Promise<WebRuntimeOrpcClient> | null = null
  protected orpcTransport: 'unknown' | 'legacy' | 'peer' = 'unknown'
  protected shellServicesChannel: WebShellServicesChannel | null = null
  protected terminalMultiplexSubscription: WebTerminalMultiplexSubscription | null = null
  protected authenticatedRuntimeId: string | null = null
  protected readonly authenticatedCapabilities = new Set<string>()
  protected readonly pairing: WebPairingOffer
  protected readonly onRuntimeId: (runtimeId: string) => void
  protected readonly options: WebRuntimeClientOptions

  constructor(
    pairing: WebPairingOffer,
    onRuntimeId: (runtimeId: string) => void = () => {},
    options: WebRuntimeClientOptions = {}
  ) {
    this.pairing = pairing
    this.onRuntimeId = onRuntimeId
    this.options = options
    this.serverPublicKey = pairing.relayMachineId ? null : publicKeyFromBase64(pairing.publicKeyB64)
    this.openConnection()
  }

  protected abstract createChildClient(options: WebRuntimeClientOptions): WebRuntimeClientContract

  abstract call(
    contract: string | RuntimeMethodContract,
    params?: unknown,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<RuntimeRpcResponse<unknown>>

  abstract getOrpcClient(timeoutMs?: number, signal?: AbortSignal): Promise<WebRuntimeOrpcClient>

  abstract subscribe(
    method: string,
    params: unknown,
    callbacks: SubscriptionCallbacks,
    options?: SubscribeOptions
  ): Promise<WebRuntimeSubscriptionHandle>

  protected abstract subscribeSharedFileWatch(
    params: unknown,
    callbacks: SubscriptionCallbacks,
    options?: { timeoutMs?: number }
  ): Promise<WebRuntimeSubscriptionHandle>

  abstract subscribeOnCurrentConnection(
    method: string,
    params: unknown,
    callbacks: SubscriptionCallbacks,
    options?: SubscribeOptions
  ): Promise<WebRuntimeSubscriptionHandle>

  protected abstract subscribeTerminalMultiplexOnCurrentConnection(
    params: unknown,
    callbacks: SubscriptionCallbacks
  ): Promise<WebRuntimeSubscriptionHandle>

  abstract close(options?: { notifySubscriptions?: boolean }): void

  protected abstract openConnection(): void

  protected abstract openSocket(endpoint: string, relay: PreparedRelayConnection | null): void

  protected abstract handleSocketMessage(rawData: unknown, sourceWs?: WebSocket): Promise<void>

  protected abstract sendEncrypted(message: unknown): boolean

  protected abstract acceptMachineBrowserReady(ready: MachineBrowserReady): Promise<boolean>

  protected abstract sendEncryptedText(plaintext: string): boolean

  protected abstract sendEncryptedBinary(bytes: Uint8Array<ArrayBufferLike>): boolean

  protected abstract waitForConnected(timeoutMs?: number, signal?: AbortSignal): Promise<void>

  protected abstract handleSocketClosed(closedWs: WebSocket): void

  protected abstract scheduleReconnect(): void

  protected abstract closeOrpcConnection(): void

  protected abstract closeTerminalMultiplexSubscription(transportClosed: boolean): void

  protected abstract openShellServicesChannel(): void

  protected abstract closeShellServicesChannel(): void

  protected abstract handleAuthorizationFailure(): void

  protected abstract setState(next: WebRuntimeConnectionState): void

  protected abstract nextId(): string

  protected abstract rejectAllPending(reason: string): void

  protected abstract rejectAllWaiters(error: Error): void

  protected abstract notifySubscriptionsClosed(): void

  protected abstract handleInterruptedSubscriptions(): void

  protected abstract replayInterruptedSubscriptions(): void

  protected abstract notifySubscriptionsError(code: string, message: string): void

  protected abstract clearTimers(): void

  protected abstract clearConnectTimer(): void

  protected abstract clearHandshakeTimer(): void

  protected abstract startHeartbeat(): void

  protected abstract clearHeartbeatTimer(): void

  protected abstract runHeartbeatTick(): void

  protected abstract sendHeartbeatProbe(now: number): void

  protected abstract getLegacyOrpcClient(): WebRuntimeOrpcClient

  protected abstract getPeerOrpcClient(): WebRuntimeOrpcClient

  protected abstract negotiateOrpcClient(
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<WebRuntimeOrpcClient>

  protected abstract connectRuntimeOrpcClient(
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<WebRuntimeOrpcClient>

  protected abstract recordRuntimeId(response: RuntimeRpcResponse<unknown>): void

  protected abstract publishRuntimeId(runtimeId: string): void
}
