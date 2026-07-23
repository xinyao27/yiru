import type {
  DeviceCredentialInstalled,
  PairingGetEndpointsParams,
  PairingGetEndpointsResult,
  PairingProvisionRelayParams
} from '@yiru/mobile-relay-protocol/credential-contract'
// Why: this is the single boundary between raw RPC frames and the YiruRuntimeService.
// Keeping the schema, handler, and result type attached to one object makes the
// CLI-facing contract greppable and lets the dispatcher verify every payload
// against the same shape the handler consumed during development.
import { ZodError, type ZodType } from 'zod'

import type { AuthenticatedRpcPrincipal } from '../../../shared/rpc-principal'
import type {
  RuntimeMethodContract,
  RuntimeMethodParams,
  RuntimeMethodResult
} from '../../../shared/runtime-method-contract'
import type { TerminalStreamFrame } from '../../../shared/terminal-stream-protocol'
import type { MobileNotificationChannel } from '../mobile-notification-channel'
import type { YiruRuntimeService } from '../yiru-runtime'
import type { RuntimeBrowserCommands } from '../yiru-runtime-browser'
import type { RuntimeEmulatorCommands } from '../yiru-runtime-emulator'
import type { RuntimeFileCommands } from '../yiru-runtime-files'
import type { RuntimeGitCommands } from '../yiru-runtime-git'

export type PairingRpcContext = {
  getEndpoints(params: PairingGetEndpointsParams): Promise<PairingGetEndpointsResult>
  provisionRelay(params: PairingProvisionRelayParams): Promise<DeviceCredentialInstalled>
}

export type RpcEnvelopeMeta = {
  runtimeId: string
}

export type RpcSuccess<TResult = unknown> = {
  id: string
  ok: true
  result: TResult
  streaming?: true
  _meta: RpcEnvelopeMeta
}

export type RpcFailure = {
  id: string
  ok: false
  error: {
    code: string
    message: string
    data?: unknown
  }
  _meta: RpcEnvelopeMeta
}

export type RpcResponse<TResult = unknown> = RpcSuccess<TResult> | RpcFailure

export type RpcRequest = {
  id: string
  authToken: string
  method: string
  params?: unknown
}

export type RpcContext = {
  runtime: YiruRuntimeService
  fileCommands: RuntimeFileCommands
  gitCommands: RuntimeGitCommands
  browserCommands: RuntimeBrowserCommands
  emulatorCommands: RuntimeEmulatorCommands
  mobileNotifications: MobileNotificationChannel
  /** Immutable identity established by the encrypted transport, when present. */
  principal?: AuthenticatedRpcPrincipal
  // Why: long-poll handlers (e.g. orchestration.check with wait=true) need to
  // observe the underlying socket's lifetime so they can release their slot
  // and resolve their inner waiters immediately when a client disconnects
  // instead of running down the configured timeoutMs. Undefined outside the
  // runtime-rpc transport (direct in-process callers don't need it).
  // See design doc §3.1 counter-lifecycle.
  signal?: AbortSignal
  // Why: streaming handlers (notifications/accounts/terminal subscribe)
  // register cleanup callbacks against the runtime so reconnects don't leak
  // listeners. Keying those cleanups by per-WebSocket connectionId lets the
  // server reap all subscriptions for a closing socket, even when other
  // sockets for the same deviceToken stay alive (multi-screen mobile).
  connectionId?: string
  // Why: shared-control multiplexes many logical streams over one socket. Some
  // handlers need the frame id to register cleanup at logical-stream granularity.
  requestId?: string
  // Why: WebSocket RPCs authenticate by mobile device token. State-owning
  // handlers use this to clean up when that paired device disconnects.
  clientId?: string
  // Why: payload windowing/truncation tuned for the constrained mobile payload
  // (e.g. native-chat block char cap) must not clip full-screen web/desktop
  // clients. Carries the paired device's scope so handlers can gate the diet to
  // phones only. Undefined for in-process callers → treat as full-class (no clip).
  clientKind?: 'mobile' | 'runtime'
  pairing?: PairingRpcContext
  // Why: mobile terminal traffic is byte-oriented and bypasses JSON streaming
  // responses after the binary terminal cutover. Undefined on Unix/socket
  // transports and non-E2EE WebSocket paths.
  sendBinary?: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
  // Why: binary terminal input/resize frames arrive outside JSON-RPC after a
  // stream is established. The WebSocket transport owns the connection-scoped
  // stream table; handlers register only the stream IDs they created.
  registerBinaryStreamHandler?: (
    streamId: number,
    handler: (frame: TerminalStreamFrame) => void
  ) => () => void
}

export type RpcHandler<TParams, TResult = unknown> = (
  params: TParams,
  ctx: RpcContext
) => Promise<TResult> | TResult

// Why: defineMethod preserves the inferred param type locally so each handler
// is fully typed, but the erased `RpcMethod` form is what the dispatcher
// actually stores. The erasure lives in one cast inside defineMethod rather
// than in every method file, which is the tradeoff for the variance problem
// of `RpcHandler` being contravariant in its param type.
export type RpcMethod = {
  readonly name: string
  readonly params: ZodType | null
  readonly mobile: boolean
  readonly handler: (params: unknown, ctx: RpcContext) => Promise<unknown> | unknown
}

type DefineMethodSpec<TSchema extends ZodType | null> = {
  name: string
  params: TSchema
  mobile?: boolean
  handler: RpcHandler<TSchema extends ZodType ? TSchema['_output'] : void>
}

type DefineContractMethodSpec<TContract extends RuntimeMethodContract> = {
  contract: TContract
  handler: RpcHandler<RuntimeMethodParams<TContract>, RuntimeMethodResult<TContract>>
}

export function defineMethod<TContract extends RuntimeMethodContract>(
  spec: DefineContractMethodSpec<TContract>
): RpcMethod
export function defineMethod<TSchema extends ZodType | null>(
  spec: DefineMethodSpec<TSchema>
): RpcMethod
export function defineMethod(
  spec: DefineMethodSpec<ZodType | null> | DefineContractMethodSpec<RuntimeMethodContract>
): RpcMethod {
  if ('contract' in spec) {
    return {
      name: spec.contract.name,
      params: spec.contract.params,
      mobile: spec.contract.mobile,
      handler: spec.handler as RpcMethod['handler']
    }
  }
  return {
    name: spec.name,
    params: spec.params,
    mobile: spec.mobile ?? false,
    handler: spec.handler as RpcMethod['handler']
  }
}

export type RpcStreamingHandler<TParams> = (
  params: TParams,
  ctx: RpcContext,
  emit: (result: unknown) => void
) => Promise<void>

// Why: streaming methods emit multiple responses over a long-lived connection.
// The `stream` flag lets the dispatcher distinguish them from one-shot methods
// and route them to the emit-based call path instead of the Promise-based one.
export type RpcStreamingMethod = {
  readonly name: string
  readonly params: ZodType | null
  readonly mobile: boolean
  readonly stream: true
  readonly handler: (
    params: unknown,
    ctx: RpcContext,
    emit: (result: unknown) => void
  ) => Promise<void>
}

type DefineStreamingMethodSpec<TSchema extends ZodType | null> = {
  name: string
  params: TSchema
  mobile?: boolean
  handler: RpcStreamingHandler<TSchema extends ZodType ? TSchema['_output'] : void>
}

export function defineStreamingMethod<TSchema extends ZodType | null>(
  spec: DefineStreamingMethodSpec<TSchema>
): RpcStreamingMethod {
  return {
    name: spec.name,
    params: spec.params,
    mobile: spec.mobile ?? false,
    stream: true,
    handler: spec.handler as RpcStreamingMethod['handler']
  }
}

export type RpcAnyMethod = RpcMethod | RpcStreamingMethod

export function isStreamingMethod(method: RpcAnyMethod): method is RpcStreamingMethod {
  return 'stream' in method && method.stream === true
}

export type RpcRegistry = ReadonlyMap<string, RpcAnyMethod>

export function buildRegistry(methods: readonly RpcAnyMethod[]): RpcRegistry {
  const registry = new Map<string, RpcAnyMethod>()
  for (const method of methods) {
    if (registry.has(method.name)) {
      throw new Error(`duplicate_rpc_method:${method.name}`)
    }
    registry.set(method.name, method)
  }
  return registry
}

export class InvalidArgumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidArgumentError'
  }
}

// Why: zod aggregates all failing fields into `issues`, but the CLI surfaces
// a single string to users. Pick the first issue's message so callers see a
// message that matches the original handler's `Missing terminal handle`-style
// phrasing (each schema supplies that literal message on its own constraint).
export function formatZodError(error: ZodError): string {
  const first = error.issues[0]
  return first?.message ?? 'invalid_argument'
}

export { ZodError }
