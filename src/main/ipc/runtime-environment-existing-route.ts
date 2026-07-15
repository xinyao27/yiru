import { getPreferredPairingOffer } from '../../shared/runtime-environments'
import { markEnvironmentUsed, resolveEnvironment } from '../../shared/runtime-environment-store'
import type { RemoteRuntimeSubscription } from '../../shared/remote-runtime-client'
import type { RuntimeRpcResponse } from '../../shared/runtime-rpc-envelope'
import { enqueueRuntimeCall } from './runtime-environment-call-queue'
import {
  sendRemoteRuntimeExistingSharedControlRequest,
  subscribeRemoteRuntimeExistingSharedControlRequest
} from './runtime-environment-request-connections'

const DEFAULT_REMOTE_RUNTIME_TIMEOUT_MS = 15_000

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
  callbacks: {
    onEvent: (
      payload:
        | { type: 'response'; response: RuntimeRpcResponse<unknown> }
        | { type: 'binary'; bytes: Uint8Array<ArrayBufferLike> }
        | { type: 'error'; code: string; message: string }
        | { type: 'close' }
    ) => void
    onClose: () => void
  }
): Promise<RemoteRuntimeSubscription> {
  const environment = resolveEnvironment(userDataPath, selector)
  const pairing = getPreferredPairingOffer(environment)
  let markedUsed = false
  return subscribeRemoteRuntimeExistingSharedControlRequest(
    environment.id,
    pairing,
    method,
    params,
    {
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
    }
  )
}
