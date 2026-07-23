import { REMOTE_RUNTIME_SHARED_CONTROL_CAPABILITY } from '@yiru/runtime-protocol/capabilities'
import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import { withRemoteRuntimeTailscaleHint } from '@yiru/runtime-protocol/tailscale-endpoint'

import {
  sendRemoteRuntimeRequest,
  subscribeRemoteRuntimeRequest,
  type RemoteRuntimeSubscription
} from '../../shared/remote-runtime-client'
import { resolveEnvironment, markEnvironmentUsed } from '../../shared/runtime-environment-store'
import {
  getPreferredPairingOffer,
  type KnownRuntimeEnvironment
} from '../../shared/runtime-environments'
import type {
  RuntimeMethodContract,
  RuntimeMethodParams,
  RuntimeMethodResult
} from '../../shared/runtime-method-contract'
import { STATUS_GET_CONTRACT } from '../../shared/runtime-method-contracts/runtime-control-contracts'
import { enqueueRuntimeCall } from './runtime-environment-call-queue'
import {
  sendRemoteRuntimeConnectionRequest,
  sendRemoteRuntimeSharedControlRequest,
  subscribeRemoteRuntimeSharedControlRequest
} from './runtime-environment-request-connections'
import { attachRemoteControlDiagnostics } from './runtime-environment-status-diagnostics'

const DEFAULT_REMOTE_RUNTIME_TIMEOUT_MS = 15_000
const sharedControlSupport = new Map<string, { cacheKey: string; check: Promise<boolean> }>()
type RuntimeEnvironmentStatus = RuntimeMethodResult<typeof STATUS_GET_CONTRACT>

export function resetSharedControlSupport(): void {
  sharedControlSupport.clear()
}

export function clearSharedControlSupport(environmentId: string): void {
  sharedControlSupport.delete(environmentId)
}

// Why: when a remote host is unreachable, point the user at Tailscale as the
// connectivity remedy; the helper no-ops on non-connectivity errors.
function withTailscaleHintForResponse<TResult>(
  response: RuntimeRpcResponse<TResult>,
  endpoint: string
): RuntimeRpcResponse<TResult> {
  if (response.ok === true) {
    return response
  }
  return {
    ...response,
    error: {
      ...response.error,
      message: withRemoteRuntimeTailscaleHint(response.error.message, endpoint)
    }
  }
}

export async function getRuntimeEnvironmentStatus(
  userDataPath: string,
  selector: string,
  timeoutMs?: number
): Promise<RuntimeRpcResponse<RuntimeEnvironmentStatus>> {
  const environment = resolveEnvironment(userDataPath, selector)
  const pairing = getPreferredPairingOffer(environment)
  let response: RuntimeRpcResponse<RuntimeEnvironmentStatus>
  try {
    response = await sendRemoteRuntimeRequest(
      pairing,
      STATUS_GET_CONTRACT,
      undefined,
      timeoutMs ?? DEFAULT_REMOTE_RUNTIME_TIMEOUT_MS
    )
  } catch (error) {
    // Why: the status UI needs shared-control diagnostics most when the
    // fresh status probe failed and the host is reconnecting/offline.
    return attachRemoteControlDiagnostics(
      withTailscaleHintForResponse(
        {
          id: STATUS_GET_CONTRACT.name,
          ok: false,
          error: {
            code: 'runtime_unavailable',
            message: error instanceof Error ? error.message : String(error)
          },
          _meta: { runtimeId: environment.runtimeId }
        },
        pairing.endpoint
      ),
      environment.id
    )
  }
  if (response.ok === true) {
    markEnvironmentUsed(userDataPath, environment.id, { runtimeId: response._meta.runtimeId })
  }
  return attachRemoteControlDiagnostics(
    withTailscaleHintForResponse(response, pairing.endpoint),
    environment.id
  )
}

type RuntimeEnvironmentResult<TContract extends string | RuntimeMethodContract> =
  TContract extends RuntimeMethodContract ? RuntimeMethodResult<TContract> : unknown

export async function callRuntimeEnvironment<TContract extends string | RuntimeMethodContract>(
  userDataPath: string,
  selector: string,
  contract: TContract,
  params: TContract extends RuntimeMethodContract ? RuntimeMethodParams<TContract> : unknown,
  timeoutMs?: number,
  options: { beforeSend?: () => void | Promise<void> } = {}
): Promise<RuntimeRpcResponse<RuntimeEnvironmentResult<TContract>>> {
  const method = typeof contract === 'string' ? contract : contract.name
  const environment = resolveEnvironment(userDataPath, selector)
  // Why: connection failures reject (they don't resolve as ok:false), so the
  // Tailscale hint is applied to the thrown error here — wrapping the resolved
  // value would miss the in-use connect/timeout case the toast surfaces.
  // Track the endpoint the queued closure actually used: it re-resolves the
  // environment, so a re-pair between enqueue and dispatch can change it.
  let endpoint = getPreferredPairingOffer(environment).endpoint
  try {
    return (await enqueueRuntimeCall(environment.id, method, async () => {
      const currentEnvironment = resolveEnvironment(userDataPath, environment.id)
      const pairing = getPreferredPairingOffer(currentEnvironment)
      endpoint = pairing.endpoint
      const effectiveTimeoutMs = timeoutMs ?? DEFAULT_REMOTE_RUNTIME_TIMEOUT_MS
      const runtimeRequest = [pairing, method, params, effectiveTimeoutMs] as const
      const connectionRequest = [currentEnvironment.id, ...runtimeRequest] as const
      if (shouldUseCachedRequestConnection(method)) {
        const response = await sendRemoteRuntimeConnectionRequest(...connectionRequest, options)
        markEnvironmentUsedFromResponse(userDataPath, currentEnvironment.id, response)
        return response
      }
      if (
        method !== STATUS_GET_CONTRACT.name &&
        (await supportsSharedControl(userDataPath, currentEnvironment, pairing, effectiveTimeoutMs))
      ) {
        const response = await sendRemoteRuntimeSharedControlRequest(...connectionRequest, options)
        markEnvironmentUsedFromResponse(userDataPath, currentEnvironment.id, response)
        return response
      }
      // Why: startup/control-plane RPCs use the proven one-shot path so repo
      // hydration cannot be coupled to a stale terminal-control connection.
      const response = await sendRemoteRuntimeRequest(...runtimeRequest, options)
      markEnvironmentUsedFromResponse(userDataPath, currentEnvironment.id, response)
      return response
    })) as RuntimeRpcResponse<RuntimeEnvironmentResult<TContract>>
  } catch (error) {
    if (error instanceof Error) {
      error.message = withRemoteRuntimeTailscaleHint(error.message, endpoint)
    }
    throw error
  }
}

export async function subscribeRuntimeEnvironment(
  userDataPath: string,
  selector: string,
  method: string,
  params: unknown,
  timeoutMs: number | undefined,
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
  const effectiveTimeoutMs = timeoutMs ?? DEFAULT_REMOTE_RUNTIME_TIMEOUT_MS
  let markedUsed = false
  const markUsedOnce = (runtimeId: string): void => {
    if (markedUsed) {
      return
    }
    markedUsed = true
    markEnvironmentUsed(userDataPath, environment.id, { runtimeId })
  }
  const callbacksWithMarkUsed = {
    onResponse: (response: RuntimeRpcResponse<unknown>) => {
      if (response.ok === true) {
        markUsedOnce(response._meta.runtimeId)
      }
      callbacks.onEvent({ type: 'response' as const, response })
    },
    onBinary: (bytes: Uint8Array<ArrayBufferLike>) =>
      callbacks.onEvent({ type: 'binary' as const, bytes }),
    onError: (error: { code: string; message: string }) =>
      callbacks.onEvent({
        type: 'error' as const,
        code: error.code,
        message: withRemoteRuntimeTailscaleHint(error.message, pairing.endpoint)
      }),
    onClose: () => {
      callbacks.onEvent({ type: 'close' as const })
      callbacks.onClose()
    }
  }
  // Why: an initial-connect failure rejects (mid-stream drops go through
  // onError above), so the hint is applied to the thrown error here too.
  try {
    if (
      shouldUseSharedControlSubscription(method) &&
      !shouldKeepDedicatedSubscriptionSocket(method) &&
      (await supportsSharedControl(userDataPath, environment, pairing, effectiveTimeoutMs))
    ) {
      return await subscribeRemoteRuntimeSharedControlRequest(
        environment.id,
        pairing,
        method,
        params,
        effectiveTimeoutMs,
        callbacksWithMarkUsed
      )
    }
    return await subscribeRemoteRuntimeRequest(
      pairing,
      method,
      params,
      effectiveTimeoutMs,
      callbacksWithMarkUsed
    )
  } catch (error) {
    if (error instanceof Error) {
      error.message = withRemoteRuntimeTailscaleHint(error.message, pairing.endpoint)
    }
    throw error
  }
}

function markEnvironmentUsedFromResponse(
  userDataPath: string,
  environmentId: string,
  response: RuntimeRpcResponse<unknown>
): void {
  if (response.ok === true) {
    markEnvironmentUsed(userDataPath, environmentId, { runtimeId: response._meta.runtimeId })
  }
}

function shouldUseCachedRequestConnection(method: string): boolean {
  return method === 'terminal.send' || method === 'terminal.updateViewport'
}

function shouldKeepDedicatedSubscriptionSocket(method: string): boolean {
  return method === 'browser.screencast' || method === 'terminal.multiplex'
}

function shouldUseSharedControlSubscription(method: string): boolean {
  return (
    method === 'runtime.clientEvents.subscribe' ||
    method === 'session.tabs.subscribe' ||
    method === 'session.tabs.subscribeAll' ||
    method === 'accounts.subscribe' ||
    method === 'notifications.subscribe' ||
    method === 'files.watch' ||
    method === 'languageServers.events.subscribe'
  )
}

async function supportsSharedControl(
  userDataPath: string,
  environment: KnownRuntimeEnvironment,
  pairing: ReturnType<typeof getPreferredPairingOffer>,
  timeoutMs: number
): Promise<boolean> {
  const cacheKey = getSharedControlSupportCacheKey(environment, pairing)
  const cached = sharedControlSupport.get(environment.id)
  if (cached?.cacheKey === cacheKey) {
    return cached.check
  }
  let resolvedCacheKey = cacheKey
  const check = (async () => {
    const response = await sendRemoteRuntimeRequest(
      pairing,
      STATUS_GET_CONTRACT,
      undefined,
      timeoutMs
    )
    if (response.ok === true) {
      markEnvironmentUsed(userDataPath, environment.id, { runtimeId: response._meta.runtimeId })
      resolvedCacheKey = getSharedControlSupportCacheKey(
        environment,
        pairing,
        response._meta.runtimeId
      )
      return (
        response.result.capabilities?.includes(REMOTE_RUNTIME_SHARED_CONTROL_CAPABILITY) === true
      )
    }
    return false
  })()
  // Why: the same saved host can be re-paired or point at a different runtime
  // binary over time; capability support belongs to that pairing/runtime identity.
  sharedControlSupport.set(environment.id, { cacheKey, check })
  try {
    const supported = await check
    const cachedAfterCheck = sharedControlSupport.get(environment.id)
    if (cachedAfterCheck?.check === check && cachedAfterCheck.cacheKey !== resolvedCacheKey) {
      sharedControlSupport.set(environment.id, { cacheKey: resolvedCacheKey, check })
    }
    return supported
  } catch (error) {
    if (sharedControlSupport.get(environment.id)?.check === check) {
      sharedControlSupport.delete(environment.id)
    }
    throw error
  }
}

function getSharedControlSupportCacheKey(
  environment: KnownRuntimeEnvironment,
  pairing: ReturnType<typeof getPreferredPairingOffer>,
  runtimeId = environment.runtimeId
): string {
  return [
    runtimeId ?? 'unknown-runtime',
    pairing.endpoint,
    pairing.deviceToken,
    pairing.publicKeyB64
  ].join('\0')
}
