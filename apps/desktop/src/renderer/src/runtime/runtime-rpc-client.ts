import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'

import type {
  RuntimeMethodContract,
  RuntimeMethodParams,
  RuntimeMethodResult
} from '../../../shared/runtime-method-contract'
import { STATUS_GET_CONTRACT } from '../../../shared/runtime-method-contracts/runtime-control-contracts'
import { withBrowserPaneUiRuntimeRpcSource } from '../../../shared/runtime-rpc-feature-interaction-source'
import type { GlobalSettings } from '../../../shared/types'
import {
  callAbortableRuntimeEnvironment,
  createRuntimeRpcAbortError
} from './abortable-runtime-environment-call'
import { ensureRuntimeEnvironmentCompatible } from './runtime-environment-compatibility'
import { unwrapRuntimeRpcResult } from './runtime-rpc-response'

export {
  assertRuntimeEnvironmentCapability,
  clearRecentRuntimeCompatibilityFailure,
  clearRuntimeCompatibilityCache,
  getRuntimeEnvironmentStatus,
  markRuntimeEnvironmentCompatible,
  runtimeEnvironmentSupportsCapability
} from './runtime-environment-compatibility'
export {
  isRuntimeScopeForbiddenError,
  RuntimeRpcCallError,
  unwrapRuntimeRpcResult
} from './runtime-rpc-response'

export type RuntimeClientTarget = { kind: 'local' } | { kind: 'environment'; environmentId: string }

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

export async function callRuntimeRpc<TResult>(
  target: RuntimeClientTarget,
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
  target: RuntimeClientTarget,
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
  target: RuntimeClientTarget,
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
  if (target.kind === 'environment' && method !== STATUS_GET_CONTRACT.name) {
    await ensureRuntimeEnvironmentCompatible(target.environmentId, options)
  }
  if (options.signal?.aborted) {
    throw createRuntimeRpcAbortError()
  }
  const nextParams = options.suppressFeatureInteraction
    ? withBrowserPaneUiRuntimeRpcSource(params)
    : params
  const response =
    target.kind === 'local'
      ? await window.api.runtime.call({ method, params: nextParams })
      : options.signal
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
