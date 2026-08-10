import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import type { RemoteRuntimeSubscription } from '~shared/remote-runtime/client'
import { markEnvironmentUsed, resolveEnvironment } from '~shared/runtime-environment-store'
import { getPreferredPairingOffer } from '~shared/runtime-environments'

import { enqueueRuntimeCall } from './environment-call-queue'
import {
  connectRemoteRuntimeExistingSharedControlOrpcTunnel,
  sendRemoteRuntimeExistingSharedControlRequest,
  subscribeRemoteRuntimeExistingSharedControlRequest,
  subscribeRemoteRuntimeRetainedExistingSharedControlRequest
} from './environment-request-connections'
import { supportsRuntimeOrpcTunnel } from './environment-shared-control'
import { callRuntimeEnvironmentUnaryOrpc } from './rpc/orpc/environment-orpc-unary-client'

const DEFAULT_REMOTE_RUNTIME_TIMEOUT_MS = 15_000

// Why: distinct from `callRuntimeEnvironment`'s own pool namespace so neither
// caller's `.orpc.connect()` replaces the other's tunnel on the same
// environment's shared-control connection (`SharedControlOrpcTunnels` keys
// tunnels by owner id and drops whichever one loses that race).
const EXISTING_ROUTE_UNARY_ORPC_POOL_NAMESPACE = 'main-process-existing-route-unary'

type RuntimeEnvironmentRouteEvent =
  | { type: 'response'; response: RuntimeRpcResponse<unknown> }
  | { type: 'binary'; bytes: Uint8Array<ArrayBufferLike> }
  | { type: 'error'; code: string; message: string }
  | { type: 'close' }

type RuntimeEnvironmentRouteCallbacks = {
  onEvent: (payload: RuntimeEnvironmentRouteEvent) => void
  onClose: () => void
}

export async function callRuntimeEnvironmentExistingRoute(
  userDataPath: string,
  selector: string,
  method: string,
  params: unknown,
  timeoutMs = DEFAULT_REMOTE_RUNTIME_TIMEOUT_MS,
  options: { beforeSend?: () => void | Promise<void>; signal?: AbortSignal } = {}
): Promise<RuntimeRpcResponse<unknown>> {
  const environment = resolveEnvironment(userDataPath, selector)
  return enqueueRuntimeCall(environment.id, method, async () => {
    const currentEnvironment = resolveEnvironment(userDataPath, environment.id)
    const pairing = getPreferredPairingOffer(currentEnvironment)
    // Why: this helper only ever forwards unary coworking.host.* leaves
    // (listWorktrees/inspectWorktree/canonicalizePath/invoke/invokeSession/
    // listLiveSessions/listHistoricalSessionPage/releaseHistoricalSessionPage/
    // revokeWorktree/releaseChannel) — its streaming siblings go through
    // `subscribeRuntimeEnvironmentExistingRoute`/`...RetainedExistingRoute`
    // instead — so trying the negotiated oRPC tunnel first is safe for every
    // method this function receives (docs/runtime-orpc-migration.md Phase 6
    // D-stage: coworking.host.* is the main-process↔main-process bare-envelope
    // class the renderer's capability negotiation could never reach).
    if (await supportsRuntimeOrpcTunnel(userDataPath, currentEnvironment, pairing, timeoutMs)) {
      const refreshedRuntimeId = resolveEnvironment(userDataPath, currentEnvironment.id).runtimeId
      if (refreshedRuntimeId) {
        const response = await callRuntimeEnvironmentUnaryOrpc({
          connect: connectRemoteRuntimeExistingSharedControlOrpcTunnel,
          poolNamespace: EXISTING_ROUTE_UNARY_ORPC_POOL_NAMESPACE,
          environmentId: currentEnvironment.id,
          pairing,
          runtimeId: refreshedRuntimeId,
          path: method.split('.'),
          params,
          timeoutMs,
          signal: options.signal,
          beforeSend: options.beforeSend
        })
        markEnvironmentUsed(userDataPath, currentEnvironment.id, { runtimeId: refreshedRuntimeId })
        return response
      }
    }
    const response = await sendRemoteRuntimeExistingSharedControlRequest(
      currentEnvironment.id,
      pairing,
      method,
      params,
      timeoutMs,
      options
    )
    if (response.ok) {
      markEnvironmentUsed(userDataPath, currentEnvironment.id, {
        runtimeId: response._meta.runtimeId
      })
    }
    return response
  })
}

export async function subscribeRuntimeEnvironmentExistingRoute(
  userDataPath: string,
  selector: string,
  method: string,
  params: unknown,
  callbacks: RuntimeEnvironmentRouteCallbacks
): Promise<RemoteRuntimeSubscription> {
  return subscribeRuntimeEnvironmentRoute(
    subscribeRemoteRuntimeExistingSharedControlRequest,
    userDataPath,
    selector,
    method,
    params,
    callbacks
  )
}

/** Retains an owner-authorized ready route across transport recovery without opening it initially. */
export async function subscribeRuntimeEnvironmentRetainedExistingRoute(
  userDataPath: string,
  selector: string,
  method: string,
  params: unknown,
  callbacks: RuntimeEnvironmentRouteCallbacks
): Promise<RemoteRuntimeSubscription> {
  return subscribeRuntimeEnvironmentRoute(
    subscribeRemoteRuntimeRetainedExistingSharedControlRequest,
    userDataPath,
    selector,
    method,
    params,
    callbacks
  )
}

function subscribeRuntimeEnvironmentRoute(
  subscribe: typeof subscribeRemoteRuntimeExistingSharedControlRequest,
  userDataPath: string,
  selector: string,
  method: string,
  params: unknown,
  callbacks: RuntimeEnvironmentRouteCallbacks
): Promise<RemoteRuntimeSubscription> {
  const environment = resolveEnvironment(userDataPath, selector)
  const pairing = getPreferredPairingOffer(environment)
  let markedUsed = false
  return subscribe(environment.id, pairing, method, params, {
    onResponse: (response) => {
      if (response.ok && !markedUsed) {
        markedUsed = true
        markEnvironmentUsed(userDataPath, environment.id, {
          runtimeId: response._meta.runtimeId
        })
      }
      callbacks.onEvent({ type: 'response', response })
    },
    onBinary: (bytes) => callbacks.onEvent({ type: 'binary', bytes }),
    onError: (error) => callbacks.onEvent({ type: 'error', ...error }),
    onClose: () => {
      callbacks.onEvent({ type: 'close' })
      callbacks.onClose()
    }
  })
}
