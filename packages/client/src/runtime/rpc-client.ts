import type { GlobalSettings } from '@yiru/runtime-protocol/workbench/types'

import type { RuntimeClientTarget } from './orpc-client'

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
