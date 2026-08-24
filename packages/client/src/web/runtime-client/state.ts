import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'

import type { BrowserRelaySession } from '../connect/grant-client'
import { LEGACY_RUNTIME_STREAM_METHODS } from '../legacy-orpc-link'

export type WebRuntimeConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'handshaking'
  | 'connected'
  | 'auth-failed'

export type PendingRequest = {
  method: string
  resolve: (response: RuntimeRpcResponse<unknown>) => void
  reject: (error: Error) => void
  timeout: number
  removeAbortListener: () => void
}

export type SubscriptionCallbacks = {
  onResponse: (response: RuntimeRpcResponse<unknown>) => void
  onBinary?: (bytes: Uint8Array<ArrayBufferLike>) => void
  onError?: (error: { code: string; message: string }) => void
  onClose?: () => void
  onTransportInterrupted?: () => void
  onTransportReplayed?: () => void
}

export type RuntimeSubscription = {
  id: string
  method: string
  params: unknown
  callbacks: SubscriptionCallbacks
  needsReplay: boolean
}

export type WebRuntimeSubscriptionHandle = {
  unsubscribe: () => void
  sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => void
}

export type SubscribeOptions = {
  timeoutMs?: number
  // Why: streaming subscriptions whose server-side cleanup is keyed by a
  // client-supplied token used to address a server-side subscription
  // must send an explicit unsubscribe RPC on teardown so the watcher is reaped
  // on view-toggle, not just on socket close. Returns the RPC frame to emit, or
  // null when the method needs no explicit teardown.
  buildUnsubscribe?: (params: unknown) => { method: string; params: unknown } | null
}

export type WebRuntimeClientOptions = {
  enableShellServices?: boolean
}

export type PreparedRelayConnection = {
  session: BrowserRelaySession
  secretKey: Uint8Array
}

export const REQUEST_TIMEOUT_MS = 30_000
export const CONNECT_TIMEOUT_MS = 12_000
export const HANDSHAKE_TIMEOUT_MS = 10_000
export const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000, 15_000]
export const SHARED_CONNECTION_SUBSCRIPTION_METHODS = new Set([
  LEGACY_RUNTIME_STREAM_METHODS.filesWatch
])
// Why: the browser WebSocket API hides protocol pings/pongs, so a half-open
// connection (mobile NAT idle timeout, server crash, wifi→cellular handoff)
// leaves readyState===OPEN with no onclose/onerror — the UI silently freezes on
// stale data and never reconnects. Poll connection liveness while the tab is
// visible: after HEARTBEAT_IDLE_MS of silence send a cheap status.get probe
// (any inbound frame proves liveness), and only if that probe stays unanswered
// for HEARTBEAT_PROBE_GRACE_MS close the socket to drive the reconnect path.
// Closing is gated on an unanswered PROBE, never on raw accumulated silence, so
// a backgrounded/frozen tab can never be mistaken for a dead socket on resume.
export const HEARTBEAT_INTERVAL_MS = 10_000
export const HEARTBEAT_IDLE_MS = 25_000
export const HEARTBEAT_PROBE_GRACE_MS = 20_000
