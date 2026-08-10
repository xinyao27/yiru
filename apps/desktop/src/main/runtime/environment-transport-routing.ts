import type {
  RuntimeOrchestrationEnvelope,
  RuntimeRpcResponse
} from '@yiru/runtime-protocol/rpc-envelope'
import { STATUS_GET_CONTRACT } from '@yiru/runtime-protocol/status'
import { withRemoteRuntimeTailscaleHint } from '@yiru/runtime-protocol/tailscale-endpoint'
import {
  sendRemoteRuntimeRequest,
  subscribeRemoteRuntimeRequest,
  type RemoteRuntimeSubscription
} from '~shared/remote-runtime/client'
import { resolveEnvironment, markEnvironmentUsed } from '~shared/runtime-environment-store'
import { getPreferredPairingOffer } from '~shared/runtime-environments'
import type {
  RuntimeMethodContract,
  RuntimeMethodParams,
  RuntimeMethodResult
} from '~shared/runtime-method-contract'

import { enqueueRuntimeCall } from './environment-call-queue'
import {
  connectRemoteRuntimeSharedControlOrpcTunnel,
  sendRemoteRuntimeConnectionRequest,
  sendRemoteRuntimeSharedControlRequest,
  subscribeRemoteRuntimeSharedControlRequest
} from './environment-request-connections'
import {
  clearSharedControlSupport,
  resetSharedControlSupport,
  supportsRuntimeOrpcTunnel,
  supportsSharedControl
} from './environment-shared-control'
import { attachRemoteControlDiagnostics } from './environment-status-diagnostics'
import { callRuntimeEnvironmentUnaryOrpc } from './rpc/orpc/environment-orpc-unary-client'

// Why: main-process↔main-process callers (ai-vault's session scanner,
// provider-usage's cursor fetcher) pool one oRPC tunnel per environment under
// this namespace — distinct from the renderer's per-webContents `ownerId`s on
// the same shared-control connection (`environment-message-port.ts`) and from
// `callRuntimeEnvironmentExistingRoute`'s own namespace below, so neither can
// replace the other's tunnel.
const MAIN_PROCESS_UNARY_ORPC_POOL_NAMESPACE = 'main-process-unary'

const DEFAULT_REMOTE_RUNTIME_TIMEOUT_MS = 15_000
type RuntimeEnvironmentStatus = RuntimeMethodResult<typeof STATUS_GET_CONTRACT>

export { clearSharedControlSupport, resetSharedControlSupport }

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
  options: {
    beforeSend?: () => void | Promise<void>
    envelope?: RuntimeOrchestrationEnvelope
  } = {}
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
      // Why: a bare envelope (`orchestrationRequestId`) can now ride the oRPC
      // tunnel as headers (slice 84 Part B — `callRuntimeEnvironmentUnaryOrpc`
      // forwards `options.envelope` to `buildRuntimeOrpcCallHeaders`) instead
      // of forcing the legacy bare-envelope path unconditionally. Computing
      // this once up front — rather than re-deriving it inside the oRPC branch
      // below — lets the envelope decision and the oRPC branch agree on the
      // same answer.
      const canUseOrpcTunnel =
        typeof contract !== 'string' &&
        method !== STATUS_GET_CONTRACT.name &&
        (await supportsRuntimeOrpcTunnel(
          userDataPath,
          currentEnvironment,
          pairing,
          effectiveTimeoutMs
        ))
      const sendWithLegacyEnvelope = async () => {
        const response = await sendRemoteRuntimeRequest(...runtimeRequest, {
          beforeSend: options.beforeSend,
          ...options.envelope
        })
        markEnvironmentUsedFromResponse(userDataPath, currentEnvironment.id, response)
        return response
      }
      if (options.envelope && !canUseOrpcTunnel) {
        return await sendWithLegacyEnvelope()
      }
      // Why: unlike `options.envelope` above (reordered in slice 84 because oRPC gained a
      // header carrier for it), this branch is intentionally left ahead of the oRPC gate.
      // `terminal.send`/`updateViewport` reach here only through a bare-string legacy
      // fallback (renderer callers negotiate oRPC first — orpc-client.ts's
      // `createRuntimeOrpcClient` — and mobile's own transport never calls into this file at
      // all), so moving `canUseOrpcTunnel` first would be a no-op for the fast path and would
      // put per-keystroke traffic on the same multiplexed shared-control socket the oRPC
      // tunnel rides for every other domain, exactly what the dedicated
      // `RemoteRuntimeRequestConnection` (environment-request-connections.ts) exists to keep
      // it off. Slice 94 investigated retiring these two `ALL_RPC_METHODS` legacy leaves and
      // declined: mobile's `MobileRuntimeOrpcTransport` latches into the same bare-string
      // legacy mode as `terminal.subscribe` (permanently for a pre-oRPC host, or transiently
      // on any capability-probe error) and needs send/updateViewport alongside it — see
      // orpc/router-direct/terminal-viewport.ts's note.
      if (shouldUseCachedRequestConnection(method)) {
        const response = await sendRemoteRuntimeConnectionRequest(...connectionRequest, options)
        markEnvironmentUsedFromResponse(userDataPath, currentEnvironment.id, response)
        return response
      }
      // Why: `RuntimeMethodContract` (the non-string branch of `contract`)
      // models one-shot request/response methods only (see its own doc
      // comment in `runtime-method-contract.ts`) — PTY/event-stream leaves
      // never pass one — so gating oRPC dispatch on "caller supplied a real
      // contract object" is exactly the unary-only boundary this transport
      // hazard fix must not cross (docs/runtime-orpc-migration.md Phase 6
      // D-stage: replay/reconnect tagging for streaming leaves has no oRPC
      // event-iterator envelope to carry it, same reason the renderer
      // migration patched call sites instead of the shared transport there).
      if (canUseOrpcTunnel) {
        const refreshedRuntimeId = resolveEnvironment(userDataPath, currentEnvironment.id).runtimeId
        if (refreshedRuntimeId) {
          const response = await callRuntimeEnvironmentUnaryOrpc({
            connect: connectRemoteRuntimeSharedControlOrpcTunnel,
            poolNamespace: MAIN_PROCESS_UNARY_ORPC_POOL_NAMESPACE,
            environmentId: currentEnvironment.id,
            pairing,
            runtimeId: refreshedRuntimeId,
            path: method.split('.'),
            params,
            timeoutMs: effectiveTimeoutMs,
            beforeSend: options.beforeSend,
            envelope: options.envelope
          })
          markEnvironmentUsedFromResponse(userDataPath, currentEnvironment.id, response)
          return response
        }
        // Why: the capability probe above just confirmed oRPC support, but the
        // runtime id disappeared before dispatch (a narrow re-pair race) — fall
        // back to the legacy bare envelope defensively rather than falling
        // through to the shared-control/plain paths below, neither of which
        // forwards `options.envelope`; that would silently drop a present
        // `orchestrationRequestId`, the mutation-idempotency key.
        if (options.envelope) {
          return await sendWithLegacyEnvelope()
        }
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
    method === 'files.watch'
  )
}
