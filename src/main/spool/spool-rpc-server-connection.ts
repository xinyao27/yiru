import type { AuthenticatedSpoolPrincipal } from '../../shared/rpc-principal'
import type {
  SpoolRpcFailure,
  SpoolRpcRequest,
  SpoolRpcResponse
} from '../../shared/spool/spool-wire-contract'
import { SPOOL_MAX_RPC_PLAINTEXT_BYTES } from '../../shared/spool/spool-wire-contract'
import type {
  BoundSpoolInvocation,
  SpoolConnectionTransport,
  SpoolRpcGatewayOptions,
  SpoolRpcInvocationContext,
  SpoolRpcMethodSpec,
  SpoolServerConnection
} from './spool-rpc-gateway'
import { projectSpoolRpcErrorCode, projectSpoolRpcErrorMessage } from './spool-rpc-error'
import {
  SPOOL_CANCEL_REQUEST_METHOD,
  SPOOL_CANCEL_SUBSCRIPTION_METHOD
} from './spool-rpc-cancellation'
import { isSpoolRpcStream, type SpoolRpcStream } from './spool-rpc-stream'
import { parseSpoolRpcRequest } from './spool-rpc-request-validation'
import { handleSpoolRpcCancellation } from './spool-rpc-server-cancellation'
import {
  MAX_CONCURRENT_SPOOL_RPCS,
  MAX_SPOOL_SUBSCRIPTIONS,
  safelyCleanupSpoolSubscription,
  type ActiveSpoolSubscription
} from './spool-rpc-server-policy'

export class SpoolGatewayConnection implements SpoolServerConnection {
  private readonly requestAborts = new Map<string, AbortController>()
  private readonly subscriptions = new Map<string, ActiveSpoolSubscription>()
  private readonly requestIds = new Set<string>()
  private activeRequests = 0
  private closed = false

  constructor(
    private readonly principal: AuthenticatedSpoolPrincipal,
    private readonly transport: SpoolConnectionTransport,
    private readonly options: SpoolRpcGatewayOptions,
    private readonly onClosed?: () => void
  ) {}

  dispatchJson(frame: string): void {
    if (this.closed) {
      return
    }
    const request = parseSpoolRpcRequest(frame)
    if (!request) {
      this.sendFailure('unknown', 'invalid_argument')
      return
    }
    if (request.method === SPOOL_CANCEL_SUBSCRIPTION_METHOD) {
      this.cancelRequested(request, (requestId) => this.finishSubscription(requestId, false))
      return
    }
    if (request.method === SPOOL_CANCEL_REQUEST_METHOD) {
      this.cancelRequested(request, (requestId) => this.requestAborts.get(requestId)?.abort())
      return
    }
    if (this.requestIds.has(request.id)) {
      // Why: a reused id could make a response look like it belongs to the original stream.
      this.disconnect(1008, 'Duplicate request id')
      return
    }
    const method = this.options.registry.get(request.method)
    if (!method) {
      this.sendFailure(request.id, 'method_not_found')
      return
    }
    if (this.activeRequests >= MAX_CONCURRENT_SPOOL_RPCS) {
      this.sendFailure(request.id, 'resource_busy')
      return
    }
    if (method.streaming && this.subscriptions.size >= MAX_SPOOL_SUBSCRIPTIONS) {
      this.sendFailure(request.id, 'resource_busy')
      return
    }
    const parsed = method.schema.safeParse(request.params)
    if (!parsed.success) {
      this.sendFailure(request.id, 'invalid_argument')
      return
    }
    const abort = new AbortController()
    this.requestIds.add(request.id)
    this.requestAborts.set(request.id, abort)
    this.activeRequests++
    const context: SpoolRpcInvocationContext = {
      principal: this.principal,
      requestId: request.id,
      signal: abort.signal
    }
    void this.invoke(method, parsed.data, context).finally(() => {
      this.requestAborts.delete(request.id)
      this.activeRequests--
      if (!this.subscriptions.has(request.id)) {
        this.requestIds.delete(request.id)
      }
    })
  }

  dispatchBinary(frame: Uint8Array<ArrayBufferLike>): void {
    if (this.closed) {
      return
    }
    void frame
    // Why: accepting binary multiplex would create a second terminal-control policy path.
    this.disconnect(1003, 'Binary frames are not supported')
  }

  disconnect(code: number, reason: string): void {
    this.close()
    this.transport.close(code, reason)
  }

  close(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    for (const abort of this.requestAborts.values()) {
      abort.abort()
    }
    this.requestAborts.clear()
    for (const requestId of this.subscriptions.keys()) {
      this.finishSubscription(requestId, false)
    }
    this.requestIds.clear()
    try {
      try {
        this.options.onConnectionClosed?.(this.principal.connectionId)
      } catch {
        // Why: transport teardown must remain idempotent even when a downstream
        // cleanup reports an error after its authority has already been revoked.
      }
    } finally {
      this.onClosed?.()
    }
  }

  private async invoke(
    method: SpoolRpcMethodSpec,
    params: unknown,
    context: SpoolRpcInvocationContext
  ): Promise<void> {
    try {
      const bound = await method.bind(params, context)
      this.options.authorize(method.access, bound, this.principal)
      const result = await method.execute(bound.value, context)
      if (this.closed || context.signal.aborted || !bound.isCurrent()) {
        return
      }
      if (method.streaming) {
        if (!isSpoolRpcStream(result)) {
          throw new Error('Spool subscription returned a non-stream result')
        }
        await this.openSubscription(method, bound, result, context)
        return
      }
      if (isSpoolRpcStream(result)) {
        throw new Error('Spool request returned an undeclared stream')
      }
      this.send({
        id: context.requestId,
        ok: true,
        result: method.project(result),
        ownerRuntimeId: this.options.ownerRuntimeId
      })
    } catch (error) {
      if (!this.closed && !context.signal.aborted) {
        this.sendFailure(
          context.requestId,
          projectSpoolRpcErrorCode(error),
          projectSpoolRpcErrorMessage(error)
        )
      }
    }
  }

  private async openSubscription(
    method: SpoolRpcMethodSpec,
    bound: BoundSpoolInvocation,
    stream: SpoolRpcStream,
    context: SpoolRpcInvocationContext
  ): Promise<void> {
    const active: ActiveSpoolSubscription = {
      abort: new AbortController(),
      cleanup: null,
      unsubscribeInvalidation: null
    }
    this.subscriptions.set(context.requestId, active)
    active.unsubscribeInvalidation =
      bound.subscribeInvalidation?.(() => this.finishSubscription(context.requestId, false)) ?? null
    const isUsable = (): boolean =>
      !this.closed &&
      this.subscriptions.get(context.requestId) === active &&
      !active.abort.signal.aborted &&
      bound.isCurrent()
    let cleanup: (() => void) | void
    try {
      cleanup = await stream.open(
        {
          next: (value) => {
            if (!isUsable()) {
              this.finishSubscription(context.requestId, false)
              return
            }
            const sent = this.send({
              id: context.requestId,
              ok: true,
              result: method.project(value),
              streaming: true,
              ownerRuntimeId: this.options.ownerRuntimeId
            })
            if (!sent) {
              this.finishSubscription(context.requestId, false)
            }
          },
          error: (error) => {
            if (isUsable()) {
              this.sendFailure(
                context.requestId,
                projectSpoolRpcErrorCode(error),
                projectSpoolRpcErrorMessage(error)
              )
            }
            this.finishSubscription(context.requestId, false)
          },
          complete: () => this.finishSubscription(context.requestId, true)
        },
        { ...context, signal: active.abort.signal }
      )
    } catch (error) {
      this.finishSubscription(context.requestId, false)
      throw error
    }
    if (this.subscriptions.get(context.requestId) === active) {
      active.cleanup = cleanup ?? null
    } else {
      cleanup?.()
    }
  }

  private cancelRequested(request: SpoolRpcRequest, cancel: (requestId: string) => void): void {
    handleSpoolRpcCancellation(request, {
      activeRequestIds: this.requestIds,
      cancel,
      disconnectDuplicate: () => this.disconnect(1008, 'Duplicate request id'),
      sendInvalidArgument: () => this.sendFailure(request.id, 'invalid_argument'),
      sendCancelled: () =>
        void this.send({
          id: request.id,
          ok: true,
          result: { cancelled: true },
          ownerRuntimeId: this.options.ownerRuntimeId
        })
    })
  }

  private finishSubscription(requestId: string, notifyRequester: boolean): void {
    const active = this.subscriptions.get(requestId)
    if (!active) {
      return
    }
    this.subscriptions.delete(requestId)
    this.requestIds.delete(requestId)
    active.abort.abort()
    safelyCleanupSpoolSubscription(active.unsubscribeInvalidation)
    safelyCleanupSpoolSubscription(active.cleanup)
    if (notifyRequester && !this.closed) {
      this.send({
        id: requestId,
        ok: true,
        result: null,
        ownerRuntimeId: this.options.ownerRuntimeId
      })
    }
  }

  private sendFailure(
    id: string,
    code: SpoolRpcFailure['error']['code'],
    message: string = code
  ): void {
    this.send({
      id,
      ok: false,
      error: { code, message },
      ownerRuntimeId: this.options.ownerRuntimeId
    })
  }

  private send(response: SpoolRpcResponse): boolean {
    if (this.closed) {
      return false
    }
    const frame = JSON.stringify(response)
    if (Buffer.byteLength(frame, 'utf8') <= SPOOL_MAX_RPC_PLAINTEXT_BYTES) {
      this.transport.sendJson(frame, response.ok && response.streaming ? response.id : undefined)
      return true
    }
    if (response.ok) {
      this.sendFailure(response.id, 'result_too_large')
      return false
    }
    this.disconnect(1011, 'Oversized RPC failure')
    return false
  }
}
