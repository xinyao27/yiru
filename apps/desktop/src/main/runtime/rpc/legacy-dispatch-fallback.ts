import { ORPCError, call, type AnyProcedure } from '@orpc/server'
import type { TerminalMultiplexFrame } from '@yiru/runtime-protocol/terminal-multiplex/frame'
import type { AuthenticatedRpcPrincipal } from '~shared/rpc-principal'

import type { RpcAccess } from './access'
import type { RpcContext, RpcEnvelopeMeta, RpcRequest, RpcResponse } from './core'
import { errorResponse, mapRuntimeError, successResponse } from './errors'
import { authenticatedCallerFingerprint } from './orchestration-mutation-executor'
import type { RuntimeOrpcContext } from './orpc/bridge'
import { directRuntimeOrpcHandlers } from './orpc/router-direct'
import { createStreamingEmit } from './streaming-emit'

// Why: the structural root cause behind every legacy registration this
// migration couldn't retire (docs/runtime-orpc-migration.md Phase 6, slice
// 110's framing correction of slices 78-94): `RpcDispatcher.dispatch`/
// `dispatchStreaming` only ever consulted the legacy `ALL_RPC_METHODS`
// table. A caller that dispatches a bare `{id, method, params}` envelope on
// a channel that never negotiates oRPC needed a legacy registration not
// because the leaf was unservable by the direct-wired oRPC router, but
// because the dispatcher never looked there. This table is the unary
// fallback: on a registry miss for exactly one of these names,
// `invokeLegacyDispatchFallback` invokes the same direct-wired procedure the
// oRPC router would use, in-process, instead of `method_not_found`.
// `LEGACY_STREAMING_DISPATCH_FALLBACK_PROCEDURES` below is its streaming
// sibling (slice 112, docs/runtime-orpc-migration-phase6-streaming-fallback-
// design.md) — split into its own table rather than merged in because
// `dispatch()` (one-shot transport) must reject a streaming method outright
// while `dispatchStreaming()` drains it through `emit` instead of returning
// one envelope, so the two need different call shapes even though the
// resolution and context-building underneath are shared. Both are kept as
// small, explicit, individually audited allowlists rather than "any
// direct-wired leaf" — growing either means re-running the same audit each
// entry already passed: safe to invoke with whatever connection state
// `dispatch`/`dispatchStreaming` has on hand (no `shellConnectionId`, no
// `resolveAdmission`/`beforeInvocation` hooks — those gate the
// WS-negotiated oRPC path specifically and duplicate checks
// `handleMessage`/`handleWebSocketMessage` already ran before reaching
// here). Each entry's own retirement note (methods/*.ts,
// orpc/router-direct/*.ts) records which real caller still sends it as a
// bare envelope.
const LEGACY_DISPATCH_FALLBACK_PROCEDURES: Readonly<Record<string, AnyProcedure>> = {
  'status.get': directRuntimeOrpcHandlers.status.get,
  'terminal.send': directRuntimeOrpcHandlers.terminal.send,
  'terminal.updateViewport': directRuntimeOrpcHandlers.terminal.updateViewport,
  'terminal.unsubscribe': directRuntimeOrpcHandlers.terminal.unsubscribe,
  'session.tabs.unsubscribe': directRuntimeOrpcHandlers.session.tabs.unsubscribe,
  'session.tabs.unsubscribeAll': directRuntimeOrpcHandlers.session.tabs.unsubscribeAll,
  'runtime.clientEvents.unsubscribe': directRuntimeOrpcHandlers.runtime.clientEvents.unsubscribe,
  'coworking.host.unsubscribeSessionChanges':
    directRuntimeOrpcHandlers.coworking.host.unsubscribeSessionChanges
}

// Why: the last 7 streaming leaves this migration couldn't retire (slice
// 112) — every one already `wireRuntimeStream`-wrapped in its own
// router-direct file under the *same* function reference the legacy
// registration used (see terminal.ts/session-tabs.ts/client-events.ts/
// coworking-host*.ts's own retirement notes), so resolving them here is
// dispatch plumbing, not new business logic. `terminal.multiplex` included:
// retiring its *dispatch* half is free and mechanically identical to the
// other 6 — the dedicated binary socket and its framing are a client-side
// concern this table never touches (see dispatcher.ts's own note on why that
// distinction matters).
const LEGACY_STREAMING_DISPATCH_FALLBACK_PROCEDURES: Readonly<Record<string, AnyProcedure>> = {
  'runtime.clientEvents.subscribe': directRuntimeOrpcHandlers.runtime.clientEvents.subscribe,
  'session.tabs.subscribe': directRuntimeOrpcHandlers.session.tabs.subscribe,
  'session.tabs.subscribeAll': directRuntimeOrpcHandlers.session.tabs.subscribeAll,
  'coworking.host.subscribeSessionChanges':
    directRuntimeOrpcHandlers.coworking.host.subscribeSessionChanges,
  'coworking.host.subscribeTerminal': directRuntimeOrpcHandlers.coworking.host.subscribeTerminal,
  'terminal.subscribe': directRuntimeOrpcHandlers.terminal.subscribe,
  'terminal.multiplex': directRuntimeOrpcHandlers.terminal.multiplex
}

// Why: oRPC's own common error names are UPPER_SNAKE (`ORPCError`'s
// `COMMON_ORPC_ERROR_DEFS`), but everything else in this envelope format uses
// the dispatcher's lowercase codes. Only these fallbacks (unary and
// streaming) can surface an `ORPCError` at all — a registered legacy handler
// never throws one — and the only sources reachable through them are
// `runtimeAccessMiddleware` (unauthorized/forbidden) and the contract's own
// input-schema validation (bad request), so this table only needs to cover
// those; an oRPC error whose code isn't listed here passes through
// unchanged, which in practice means our own lowercase codes thrown via
// `throwRuntimeOrpcFailure` inside `invokeRuntimeOrpcOperation` (bridge.ts) —
// those never collide with the uppercase names below.
const ORPC_COMMON_ERROR_CODE_TO_LEGACY: Readonly<Record<string, string>> = {
  BAD_REQUEST: 'invalid_argument',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'method_not_found',
  TIMEOUT: 'timeout',
  TOO_MANY_REQUESTS: 'runtime_busy',
  SERVICE_UNAVAILABLE: 'runtime_unavailable'
}

/** The direct-wired procedure that serves `method` as a legacy-registry miss, if any. */
export function legacyDispatchFallbackProcedure(method: string): AnyProcedure | undefined {
  return LEGACY_DISPATCH_FALLBACK_PROCEDURES[method]
}

// Why: the whole unary-fallback branch, in one call — shared by
// `dispatch`/`dispatchStreaming`'s registry-miss handling. Returns the
// ordinary `method_not_found` response on a genuine miss so both callers can
// treat every registry miss identically without repeating that fallthrough.
export async function serveLegacyDispatchFallback(
  request: RpcRequest,
  meta: RpcEnvelopeMeta,
  moduleContext: RpcContext,
  connectionState: RpcConnectionState
): Promise<RpcResponse> {
  const fallback = legacyDispatchFallbackProcedure(request.method)
  if (fallback) {
    return invokeLegacyDispatchFallback(fallback, request, meta, moduleContext, connectionState)
  }
  return errorResponse(request.id, meta, 'method_not_found', `Unknown method: ${request.method}`)
}

/** The direct-wired streaming procedure that serves `method` as a legacy-registry miss, if any. */
export function legacyStreamingDispatchFallbackProcedure(method: string): AnyProcedure | undefined {
  return LEGACY_STREAMING_DISPATCH_FALLBACK_PROCEDURES[method]
}

// Why: the per-request connection facts a transport can supply — a Unix
// socket call has only `signal`, a WebSocket call has all of these. Shared
// with dispatcher.ts's `handlerInvocationContext`, which builds a legacy
// handler's full `RpcContext` from the same shape, so the two stay in sync
// by construction instead of by convention.
export type RpcConnectionState = {
  signal?: AbortSignal
  connectionId?: string
  clientId?: string
  clientKind?: 'mobile' | 'runtime'
  principal?: AuthenticatedRpcPrincipal
  grantedAccess?: RpcAccess
  sendBinary?: (bytes: Uint8Array<ArrayBufferLike>) => boolean | void
  registerBinaryStreamHandler?: (
    streamId: number,
    handler: (frame: TerminalMultiplexFrame) => void
  ) => () => void
}

// Why: the field list both fallbacks' `RuntimeOrpcContext` needs is
// identical — naming it once keeps the unary and streaming invoke functions
// from drifting on the one load-bearing field, `resolveInvocationMetadata`
// pinning `requestId` to the original bare envelope's `request.id`. Without
// it, `invokeRuntimeOrpcOperation` fabricates a random `requestId` via
// `randomUUID()`, and a subscribe handler's `subscriptionId` (built from
// `context.requestId`) stops matching what the client's cleanup envelope
// sends back on unsubscribe — a silent subscription leak, not an error (see
// docs/runtime-orpc-migration-phase6-streaming-fallback-design.md §3.2).
function buildLegacyDispatchFallbackContext(
  request: RpcRequest,
  moduleContext: RpcContext,
  connectionState: RpcConnectionState
): RuntimeOrpcContext {
  return {
    ...moduleContext,
    principal: connectionState.principal,
    grantedAccess: connectionState.grantedAccess,
    connectionId: connectionState.connectionId,
    clientId: connectionState.clientId,
    clientKind: connectionState.clientKind,
    authenticatedCallerFingerprint: authenticatedCallerFingerprint(request),
    sendBinary: connectionState.sendBinary,
    registerBinaryStreamHandler: connectionState.registerBinaryStreamHandler,
    resolveInvocationMetadata: () => ({
      requestId: request.id,
      orchestrationCapability: request.orchestrationCapability,
      orchestrationContractVersion: request.orchestrationContractVersion,
      orchestrationRequestId: request.orchestrationRequestId
    })
  }
}

// Why: `call()` runs the procedure's full pipeline — `runtimeAccessMiddleware`
// (the same access check `denyAccess` performs for a still-registered method,
// now driven by the contract's `access`/`mobile` meta instead of the legacy
// `RpcMethod`), contract input-schema validation, and the handler itself via
// `invokeRuntimeOrpcHandler`/`invokeRuntimeOrpcOperation` (bridge.ts) — which
// is what gives this path the `status.get` paired-device decoration,
// orchestration-mutation-receipt wrapping, and feature-interaction recording
// a registered method gets, without duplicating any of it here.
export async function invokeLegacyDispatchFallback(
  procedure: AnyProcedure,
  request: RpcRequest,
  meta: RpcEnvelopeMeta,
  moduleContext: RpcContext,
  connectionState: RpcConnectionState
): Promise<RpcResponse> {
  const context = buildLegacyDispatchFallbackContext(request, moduleContext, connectionState)
  try {
    // Why: `path` only affects logging/error messages (`runtimeAccessMiddleware`
    // interpolates it into a denial message via `path.join('.')`) — `call()`
    // invokes a single procedure directly, bypassing the router traversal that
    // would otherwise supply it, so an unauthorized bare-envelope caller would
    // see a blank method name in its denial without this.
    const result = await call(procedure, request.params, {
      context,
      signal: connectionState.signal,
      path: request.method.split('.')
    })
    return successResponse(request.id, meta, result)
  } catch (error) {
    return mapLegacyDispatchFallbackError(request, meta, error)
  }
}

// Why: the streaming sibling of `invokeLegacyDispatchFallback` (slice 112).
// An event-iterator procedure's `call()` resolves to the `AsyncIterable` the
// handler's own generator produced — an in-process call never encodes it
// over a transport (confirmed against `orpc/registered-stream.ts`'s
// `wireRuntimeStream`: its handler is a plain function returning the
// generator, not an async function wrapping it) — so this drains it into the
// caller's `emit` instead of returning one envelope. `emit` is the
// dispatcher's own streaming-response closure, reused verbatim, which is
// what gives this path feature-interaction recording + `successResponse` +
// `streaming: true` + `reply` for free, identically to a still-legacy-
// registered streaming method. Returns an error `RpcResponse` only on
// failure — a clean drain has already sent every frame (including the
// handler's own terminal `{type:'end'}`) through `emit` via
// `registerSubscriptionCleanup`'s teardown callback, so there is nothing left
// for the caller to reply with.
export async function invokeLegacyStreamingDispatchFallback(
  procedure: AnyProcedure,
  request: RpcRequest,
  meta: RpcEnvelopeMeta,
  moduleContext: RpcContext,
  connectionState: RpcConnectionState,
  emit: (result: unknown) => void
): Promise<RpcResponse | undefined> {
  const context = buildLegacyDispatchFallbackContext(request, moduleContext, connectionState)
  try {
    const result: unknown = await call(procedure, request.params, {
      context,
      signal: connectionState.signal,
      path: request.method.split('.')
    })
    if (isAsyncIterable(result)) {
      for await (const value of result) {
        emit(value)
      }
    }
    return undefined
  } catch (error) {
    return mapLegacyDispatchFallbackError(request, meta, error)
  }
}

// Why: the whole streaming-fallback branch, in one call — pairs
// `createStreamingEmit` (streaming-emit.ts, shared with `RpcDispatcher`'s
// legacy-registered streaming branch) with `invokeLegacyStreamingDispatchFallback`
// and replies with the failure envelope if the drain never got to emit one
// itself. Kept here rather than inlined in dispatcher.ts because this is the
// one place that needs to know both halves; `dispatch`/`dispatchStreaming`
// only need to know "does a streaming fallback exist for this method".
export async function serveLegacyStreamingDispatchFallback(
  procedure: AnyProcedure,
  request: RpcRequest,
  meta: RpcEnvelopeMeta,
  moduleContext: RpcContext,
  connectionState: RpcConnectionState,
  reply: (response: string) => void
): Promise<void> {
  const [emit] = createStreamingEmit(moduleContext.runtime, request, meta, reply)
  const failure = await invokeLegacyStreamingDispatchFallback(
    procedure,
    request,
    meta,
    moduleContext,
    connectionState,
    emit
  )
  if (failure) {
    reply(JSON.stringify(failure))
  }
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
  )
}

// Why: translate oRPC's UPPER_SNAKE common codes back to the dispatcher's
// lowercase convention (see ORPC_COMMON_ERROR_CODE_TO_LEGACY's own note) so a
// bare-envelope caller can't tell this fallback apart from a still
// legacy-registered method by its error code.
function mapLegacyDispatchFallbackError(
  request: RpcRequest,
  meta: RpcEnvelopeMeta,
  error: unknown
): RpcResponse {
  if (error instanceof ORPCError) {
    const code = ORPC_COMMON_ERROR_CODE_TO_LEGACY[error.code] ?? error.code
    return errorResponse(request.id, meta, code, error.message, error.data)
  }
  return mapRuntimeError(request.id, meta, error)
}
