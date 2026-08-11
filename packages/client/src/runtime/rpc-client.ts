import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import { STATUS_GET_CONTRACT } from '@yiru/runtime-protocol/status'
import type {
  RuntimeMethodContract,
  RuntimeMethodParams,
  RuntimeMethodResult
} from '~shared/runtime-method-contract'
import { withBrowserPaneUiRuntimeRpcSource } from '~shared/runtime-rpc-feature-interaction-source'
import type { GlobalSettings } from '~shared/types'

import {
  callAbortableRuntimeEnvironment,
  createRuntimeRpcAbortError
} from './abortable-runtime-environment-call'
import { ensureRuntimeEnvironmentCompatible } from './environment-compatibility'
import type { RuntimeClientTarget } from './orpc-client'
import { unwrapRuntimeRpcResult } from './rpc-response'

export {
  assertRuntimeEnvironmentCapability,
  clearRecentRuntimeCompatibilityFailure,
  clearRuntimeCompatibilityCache,
  getRuntimeEnvironmentStatus,
  markRuntimeEnvironmentCompatible,
  runtimeEnvironmentSupportsCapability
} from './environment-compatibility'
export {
  isRuntimeScopeForbiddenError,
  RuntimeRpcCallError,
  unwrapRuntimeRpcResult
} from './rpc-response'
export type { RuntimeClientTarget } from './orpc-client'

export function getActiveRuntimeTarget(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
): RuntimeClientTarget {
  const environmentId = settings?.activeRuntimeEnvironmentId?.trim()
  if (!environmentId) {
    return { kind: 'local' }
  }
  return { kind: 'environment', environmentId }
}

export function settingsForRuntimeOwner(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  runtimeEnvironmentId: string | null | undefined
): Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined {
  if (runtimeEnvironmentId === null) {
    return { activeRuntimeEnvironmentId: null }
  }
  const ownerId = runtimeEnvironmentId?.trim()
  return ownerId ? { activeRuntimeEnvironmentId: ownerId } : settings
}

// Why: the only caller (orpc-legacy-client.ts) reaches this exclusively for
// environment targets whose oRPC negotiation fell back to the legacy JSON-RPC
// envelope. A local target never needs a legacy fallback — the local peer
// always speaks oRPC over its pooled MessagePort (orpc-client.ts) — so this
// dispatcher no longer carries a 'local' branch at all.
type EnvironmentRuntimeClientTarget = Extract<RuntimeClientTarget, { kind: 'environment' }>

export async function callRuntimeRpc<TResult>(
  target: EnvironmentRuntimeClientTarget,
  contract: string,
  params?: unknown,
  options?: {
    timeoutMs?: number
    suppressFeatureInteraction?: boolean
    reuseRecentCompatibilityFailure?: boolean
    signal?: AbortSignal
  }
): Promise<TResult>
export async function callRuntimeRpc<TContract extends RuntimeMethodContract>(
  target: EnvironmentRuntimeClientTarget,
  contract: TContract,
  params: RuntimeMethodParams<TContract>,
  options?: {
    timeoutMs?: number
    suppressFeatureInteraction?: boolean
    reuseRecentCompatibilityFailure?: boolean
    signal?: AbortSignal
  }
): Promise<RuntimeMethodResult<TContract>>
export async function callRuntimeRpc<TResult>(
  target: EnvironmentRuntimeClientTarget,
  contract: string | RuntimeMethodContract,
  params?: unknown,
  options: {
    timeoutMs?: number
    suppressFeatureInteraction?: boolean
    reuseRecentCompatibilityFailure?: boolean
    signal?: AbortSignal
  } = {}
): Promise<TResult> {
  const method = typeof contract === 'string' ? contract : contract.name
  if (method !== STATUS_GET_CONTRACT.name) {
    await ensureRuntimeEnvironmentCompatible(target.environmentId, options)
  }
  if (options.signal?.aborted) {
    throw createRuntimeRpcAbortError()
  }
  const nextParams = options.suppressFeatureInteraction
    ? withBrowserPaneUiRuntimeRpcSource(params)
    : params
  const response = options.signal
    ? await callAbortableRuntimeEnvironment(
        target.environmentId,
        method,
        nextParams,
        options.timeoutMs,
        options.signal
      )
    : await window.api.runtimeEnvironments.call({
        selector: target.environmentId,
        method,
        params: nextParams,
        timeoutMs: options.timeoutMs
      })
  return unwrapRuntimeRpcResult<TResult>(response as RuntimeRpcResponse<TResult>)
}
