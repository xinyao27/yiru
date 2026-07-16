import { remoteRuntimeUnavailableError } from './remote-runtime-request-frames'
import { REMOTE_RUNTIME_CANCEL_REQUEST_METHOD } from './remote-runtime-request-cancellation'
import { requestSharedControl } from './remote-runtime-shared-control-requests'
import {
  sendSharedControlRequest,
  sendSharedControlSubscription
} from './remote-runtime-shared-control-send'
import { rejectSharedControlPendingRequest } from './remote-runtime-shared-control-state'
import { startSharedControlSubscription } from './remote-runtime-shared-control-subscription-start'
import { sendSharedControlCleanupRequest } from './remote-runtime-shared-control-subscriptions'
import type {
  RemoteRuntimeSharedSubscription,
  SharedControlLogicalSubscription,
  SharedControlPendingRequest,
  SharedControlSubscriptionCallbacks
} from './remote-runtime-shared-control-types'
import type { RuntimeRpcResponse } from './runtime-rpc-envelope'

type RemoteRuntimeExistingRouteAccessOptions = {
  deviceToken: string
  pendingRequests: Map<string, SharedControlPendingRequest<unknown>>
  subscriptions: Map<string, SharedControlLogicalSubscription<unknown>>
  readyRouteGeneration: () => number | null
  sendEncrypted: (payload: unknown) => boolean
  closeSubscription: (requestId: string) => void
}

/** Uses only an already-ready shared-control route; owner policy may explicitly retain it. */
export class RemoteRuntimeExistingRouteAccess {
  constructor(private readonly options: RemoteRuntimeExistingRouteAccessOptions) {}

  request<TResult>(
    method: string,
    params: unknown,
    timeoutMs: number,
    requestOptions: { beforeSend?: () => void | Promise<void>; signal?: AbortSignal } = {}
  ): Promise<RuntimeRpcResponse<TResult>> {
    const routeGeneration = this.requireCurrentRoute()
    // Why: a borrowed request timeout must not reset or reconnect the owner's route.
    return requestSharedControl({
      pendingRequests: this.options.pendingRequests,
      method,
      params,
      timeoutMs,
      ensureReady: () => this.requireSameRoute(routeGeneration),
      beforeSend: requestOptions.beforeSend,
      signal: requestOptions.signal,
      send: (id, name, input) => this.sendRequest(id, name, input, routeGeneration),
      cancel: (id) => this.cancelRequest(id, routeGeneration)
    })
  }

  subscribe<TResult>(
    method: string,
    params: unknown,
    callbacks: SharedControlSubscriptionCallbacks<TResult>
  ): Promise<RemoteRuntimeSharedSubscription> {
    return this.startSubscription(method, params, callbacks, false)
  }

  subscribeRetained<TResult>(
    method: string,
    params: unknown,
    callbacks: SharedControlSubscriptionCallbacks<TResult>
  ): Promise<RemoteRuntimeSharedSubscription> {
    // Why: owner policy may retain an already-ready route, but must never create the first route.
    return this.startSubscription(method, params, callbacks, true)
  }

  private startSubscription<TResult>(
    method: string,
    params: unknown,
    callbacks: SharedControlSubscriptionCallbacks<TResult>,
    replayOnReconnect: boolean
  ): Promise<RemoteRuntimeSharedSubscription> {
    const routeGeneration = this.requireCurrentRoute()
    return startSharedControlSubscription({
      subscriptions: this.options.subscriptions,
      method,
      params,
      callbacks,
      ensureReady: () => this.requireSameRoute(routeGeneration),
      sendSubscription: (subscription) => this.sendSubscription(subscription, routeGeneration),
      closeSubscription: this.options.closeSubscription,
      replayOnReconnect
    })
  }

  private requireCurrentRoute(): number {
    const routeGeneration = this.options.readyRouteGeneration()
    if (routeGeneration === null) {
      throw remoteRuntimeUnavailableError()
    }
    return routeGeneration
  }

  private requireSameRoute(routeGeneration: number): Promise<void> {
    return this.isSameRoute(routeGeneration)
      ? Promise.resolve()
      : Promise.reject(remoteRuntimeUnavailableError())
  }

  private sendRequest(
    requestId: string,
    method: string,
    params: unknown,
    routeGeneration: number
  ): void {
    sendSharedControlRequest({
      pendingRequests: this.options.pendingRequests,
      requestId,
      deviceToken: this.options.deviceToken,
      method,
      params,
      send: (payload) => this.sendOnRoute(payload, routeGeneration),
      reject: (id, error) =>
        rejectSharedControlPendingRequest(this.options.pendingRequests, id, error)
    })
  }

  private sendSubscription(
    subscription: SharedControlLogicalSubscription<unknown>,
    routeGeneration: number
  ): void {
    sendSharedControlSubscription({
      subscriptions: this.options.subscriptions,
      subscription,
      deviceToken: this.options.deviceToken,
      send: (payload) => this.sendOnRoute(payload, routeGeneration)
    })
  }

  private cancelRequest(requestId: string, routeGeneration: number): void {
    sendSharedControlCleanupRequest({
      deviceToken: this.options.deviceToken,
      method: REMOTE_RUNTIME_CANCEL_REQUEST_METHOD,
      params: { requestId },
      send: (payload) => this.sendOnRoute(payload, routeGeneration)
    })
  }

  private sendOnRoute(payload: unknown, routeGeneration: number): boolean {
    return this.isSameRoute(routeGeneration) && this.options.sendEncrypted(payload)
  }

  private isSameRoute(routeGeneration: number): boolean {
    return this.options.readyRouteGeneration() === routeGeneration
  }
}
