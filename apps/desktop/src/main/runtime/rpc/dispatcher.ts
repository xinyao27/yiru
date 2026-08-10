import { emulatorProbe, emulatorProbeError } from '~main/emulator/probe'
import type { FeatureInteractionId } from '~shared/feature-interactions'

import type { YiruRuntimeService } from '../yiru-runtime'
import { denyAccess, denyRedirectedProjectAccess } from './access-adjudication'
import { isMethodAvailableToMobile } from './contract-mobile-availability'
// Why: the dispatcher is the one place that knows how to turn a validated
// RPC request into a response envelope. Splitting it from the transport
// makes it unit-testable without spinning up a socket, and keeps
// rpc.ts focused on framing/auth/connection bookkeeping.
import {
  ZodError,
  InvalidArgumentError,
  buildRegistry,
  formatZodError,
  isStreamingMethod,
  type RpcAnyMethod,
  type RpcContext,
  type RpcEnvelopeMeta,
  type RpcRegistry,
  type RpcRequest,
  type RpcResponse
} from './core'
import {
  computerErrorData,
  errorResponse,
  mapBrowserError,
  mapEmulatorError,
  mapRuntimeError,
  successResponse
} from './errors'
import { recordRuntimeFeatureInteraction } from './feature-interaction'
import {
  legacyStreamingDispatchFallbackProcedure,
  serveLegacyDispatchFallback,
  serveLegacyStreamingDispatchFallback,
  type RpcConnectionState
} from './legacy-dispatch-fallback'
import { orchestrationMigrationFence } from './orchestration-contract-fence'
import {
  authenticatedCallerFingerprint,
  orchestrationMutationExecutorFor,
  type OrchestrationMutationExecutor,
  type DurableMutationInvocation
} from './orchestration-mutation-executor'
import { createStreamingEmit } from './streaming-emit'

export type DispatcherOptions = {
  runtime: YiruRuntimeService
  methods: readonly RpcAnyMethod[]
  mobileDevelopmentPairing?: RpcContext['mobileDevelopmentPairing']
}

// Why: `ALL_RPC_METHODS` (methods/index.ts) is empty as of slice 112 — every
// bare-envelope request now misses `this.registry` and falls through to
// `serveLegacyDispatchFallback`/its streaming sibling below. That does not
// make this class dead code: `dispatch`/`dispatchStreaming` remain the entry
// point every bare-string caller (Unix socket, WebSocket, shared-control) is
// still funneled through, and the two fallback tables in
// legacy-dispatch-fallback.ts are a small, audited allowlist rather than "any
// direct-wired leaf" — an unlisted bare method name still correctly resolves
// to `method_not_found`. What *is* dead code, and predates this slice: once
// every top-level `runtimeContract` domain became direct-wired
// (`DIRECTLY_WIRED_RUNTIME_DOMAINS` in router-direct.ts, complete since 切片
// 88's `terminal`), `router.ts`'s `bridgeRuntimeRouter(bridgedRuntimeImplementation)`
// call has been receiving an empty object — `bridgeRuntimeProcedure`/
// router-bridge.ts have had nothing to bridge since then, independent of
// whether any individual leaf still carried a legacy *dispatch* registration.
export class RpcDispatcher {
  private readonly registry: RpcRegistry
  private readonly moduleContext: RpcContext
  private readonly orchestrationMutations: OrchestrationMutationExecutor

  constructor({ runtime, methods, mobileDevelopmentPairing }: DispatcherOptions) {
    this.registry = buildRegistry(methods)
    this.orchestrationMutations = orchestrationMutationExecutorFor(runtime)
    this.moduleContext = {
      runtime,
      fileCommands: runtime.fileCommands,
      gitCommands: runtime.gitCommands,
      browserCommands: runtime.browserCommands,
      emulatorCommands: runtime.emulatorCommands,
      mobileNotifications: runtime.mobileNotifications,
      mobileDevelopmentPairing
    }
  }

  isAvailableToMobile(method: string): boolean {
    // Why: consult the contract, not just the legacy registry — Phase 6 retires
    // legacy twins domain by domain, and a retired mobile-flagged procedure
    // must not read as "denied to mobile" just because its twin is gone.
    return isMethodAvailableToMobile(method, this.registry.get(method)?.mobile === true)
  }

  async dispatch(request: RpcRequest, options?: { signal?: AbortSignal }): Promise<RpcResponse> {
    const meta = this.meta()
    const method = this.registry.get(request.method)
    if (!method) {
      // Why: mirrors the legacy-registered check below — a streaming leaf
      // resolved only through the fallback (legacy-dispatch-fallback.ts)
      // still requires a transport that can call `reply` more than once.
      if (legacyStreamingDispatchFallbackProcedure(request.method)) {
        return this.streamingTransportRequiredResponse(request, meta)
      }
      return serveLegacyDispatchFallback(request, meta, this.moduleContext, options ?? {})
    }

    const migrationFence = orchestrationMigrationFence(request, meta)
    if (migrationFence) {
      return migrationFence
    }

    const parsedParams = this.parseParams(request, method, meta)
    if (parsedParams.error) {
      return parsedParams.error
    }

    // Why: streaming methods are not supported over one-shot transports like
    // Unix sockets. They require a reply function that can be called multiple
    // times, which is only available via dispatchStreaming.
    if (isStreamingMethod(method)) {
      return this.streamingTransportRequiredResponse(request, meta)
    }

    const isEmulator = request.method.startsWith('emulator.')
    if (isEmulator) {
      emulatorProbe(`rpc ${request.method}`, request.params)
    }
    try {
      const invoke = (mutation?: DurableMutationInvocation): Promise<unknown> | unknown =>
        method.handler(
          parsedParams.value,
          this.handlerInvocationContext(request, { signal: options?.signal }, mutation)
        )
      const result = await this.orchestrationMutations.run(request, parsedParams.value, invoke)
      this.recordRuntimeFeatureInteraction(request.method, result, undefined, request.params)
      return successResponse(request.id, meta, result)
    } catch (error) {
      if (isEmulator) {
        emulatorProbeError(`rpc ${request.method}`, error, { params: request.params })
      }
      return this.mapError(request, meta, error)
    }
  }

  // Why: streaming dispatch sends multiple responses through the reply callback
  // instead of returning a single Promise. This enables terminal.subscribe and
  // other subscription-style methods that push data over time.
  // `options.grantedAccess` is the authority this caller was granted, for
  // callers whose admission carries one. Absent for `local`/`mobile`/`runtime`,
  // which are the owner's own clients and are not scope-limited today.
  async dispatchStreaming(
    request: RpcRequest,
    reply: (response: string) => void,
    options?: RpcConnectionState
  ): Promise<void> {
    const meta = this.meta()
    const method = this.registry.get(request.method)
    if (!method) {
      // Why: the streaming fallback (legacy-dispatch-fallback.ts, slice 112)
      // resolves the 7 streaming leaves this migration couldn't retire —
      // checked before the unary fallback below because it drains a
      // generator through `emit` instead of producing one reply envelope.
      const streamingFallback = legacyStreamingDispatchFallbackProcedure(request.method)
      if (streamingFallback) {
        await serveLegacyStreamingDispatchFallback(
          streamingFallback,
          request,
          meta,
          this.moduleContext,
          options ?? {},
          reply
        )
        return
      }
      const fallback = await serveLegacyDispatchFallback(
        request,
        meta,
        this.moduleContext,
        options ?? {}
      )
      reply(JSON.stringify(fallback))
      return
    }

    const migrationFence = orchestrationMigrationFence(request, meta)
    if (migrationFence) {
      reply(JSON.stringify(migrationFence))
      return
    }

    // Why: the single adjudication point for `access`. Handlers must not repeat
    // this — a check that lives in 450 handlers is a check that will be missed
    // in the 451st. Denials are computed before params are even parsed so an
    // unauthorized caller learns nothing about the method's shape.
    const denial = denyAccess(method, meta, request.id, {
      principal: options?.principal,
      grantedAccess: options?.grantedAccess
    })
    if (denial) {
      reply(JSON.stringify(denial))
      return
    }

    const parsedParams = this.parseParams(request, method, meta)
    if (parsedParams.error) {
      reply(JSON.stringify(parsedParams.error))
      return
    }

    const redirectDenial = await denyRedirectedProjectAccess(
      method,
      parsedParams.value,
      meta,
      request.id,
      { principal: options?.principal, runtime: this.moduleContext.runtime }
    )
    if (redirectDenial) {
      return reply(JSON.stringify(redirectDenial))
    }

    if (!isStreamingMethod(method)) {
      try {
        const invoke = (mutation?: DurableMutationInvocation): Promise<unknown> | unknown =>
          method.handler(
            parsedParams.value,
            this.handlerInvocationContext(request, options ?? {}, mutation)
          )
        const result = await this.orchestrationMutations.run(request, parsedParams.value, invoke)
        this.recordRuntimeFeatureInteraction(request.method, result, undefined, request.params)
        reply(JSON.stringify(successResponse(request.id, meta, result)))
      } catch (error) {
        reply(JSON.stringify(this.mapError(request, meta, error)))
      }
      return
    }

    const [emit, recordedStreamingFeatureInteractions] = createStreamingEmit(
      this.moduleContext.runtime,
      request,
      meta,
      reply
    )

    try {
      // Why: unlike the unary branch above, a streaming handler's context has
      // never carried `grantedAccess` — preserved here rather than passing
      // `options` wholesale.
      const result = await method.handler(
        parsedParams.value,
        this.handlerInvocationContext(request, {
          signal: options?.signal,
          connectionId: options?.connectionId,
          clientId: options?.clientId,
          clientKind: options?.clientKind,
          principal: options?.principal,
          sendBinary: options?.sendBinary,
          registerBinaryStreamHandler: options?.registerBinaryStreamHandler
        }),
        emit
      )
      this.recordRuntimeFeatureInteraction(
        request.method,
        result,
        recordedStreamingFeatureInteractions,
        request.params
      )
    } catch (error) {
      reply(JSON.stringify(this.mapError(request, meta, error)))
    }
  }

  // Why: the field list a legacy handler's `RpcContext` needs was repeated at
  // every call site (dispatch's unary path, dispatchStreaming's unary path,
  // dispatchStreaming's streaming path) with only `connectionState` varying —
  // naming it once keeps `RpcConnectionState`'s shape and this object's
  // shape from drifting apart from each other silently.
  private handlerInvocationContext(
    request: RpcRequest,
    connectionState: RpcConnectionState,
    mutation?: DurableMutationInvocation
  ): RpcContext {
    return {
      ...this.moduleContext,
      ...connectionState,
      requestId: request.id,
      orchestrationCapability: request.orchestrationCapability,
      authenticatedCallerFingerprint: authenticatedCallerFingerprint(request),
      recordMutationReceipt: mutation?.recordReceipt,
      orchestrationMutation: mutation?.identity
    }
  }

  private parseParams(
    request: RpcRequest,
    method: RpcAnyMethod,
    meta: RpcEnvelopeMeta
  ): { value: unknown; error?: undefined } | { value?: undefined; error: RpcResponse } {
    if (method.params === null) {
      return { value: undefined }
    }
    const rawParams = request.params ?? {}
    const result = method.params.safeParse(rawParams)
    if (!result.success) {
      return {
        error: this.invalidArgumentResponse(request, meta, formatZodError(result.error))
      }
    }
    return { value: result.data }
  }

  private mapError(request: RpcRequest, meta: RpcEnvelopeMeta, error: unknown): RpcResponse {
    if (error instanceof ZodError) {
      return this.invalidArgumentResponse(request, meta, formatZodError(error))
    }
    if (error instanceof InvalidArgumentError) {
      return this.invalidArgumentResponse(request, meta, error.message)
    }

    // Why: browser methods throw BrowserError with a structured `code`;
    // every other runtime error has a plain-message code. Routing by method
    // prefix keeps the mapping a single decision rather than a per-method
    // flag callers must remember to set.
    if (request.method.startsWith('browser.')) {
      return mapBrowserError(request.id, meta, error)
    }
    if (request.method.startsWith('emulator.')) {
      return mapEmulatorError(request.id, meta, error)
    }
    return mapRuntimeError(request.id, meta, error)
  }

  private invalidArgumentResponse(
    request: RpcRequest,
    meta: RpcEnvelopeMeta,
    message: string
  ): RpcResponse {
    return errorResponse(
      request.id,
      meta,
      'invalid_argument',
      message,
      request.method.startsWith('computer.') ? computerErrorData('invalid_argument') : undefined
    )
  }

  // Why: shared by the legacy-registered streaming check (dispatch's own
  // `isStreamingMethod`) and the streaming-fallback check above it — a
  // one-shot transport can't call `reply` more than once either way.
  private streamingTransportRequiredResponse(
    request: RpcRequest,
    meta: RpcEnvelopeMeta
  ): RpcResponse {
    return errorResponse(
      request.id,
      meta,
      'method_not_supported',
      `Method ${request.method} requires a streaming transport`
    )
  }

  private meta(): RpcEnvelopeMeta {
    return { runtimeId: this.moduleContext.runtime.getRuntimeId() }
  }

  private recordRuntimeFeatureInteraction(
    method: string,
    result: unknown,
    alreadyRecorded?: Set<FeatureInteractionId>,
    rawParams?: unknown
  ): void {
    recordRuntimeFeatureInteraction(
      this.moduleContext.runtime,
      method,
      result,
      alreadyRecorded,
      rawParams
    )
  }
}
