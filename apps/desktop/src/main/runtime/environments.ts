import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import {
  listEnvironments,
  removeEnvironment,
  resolveEnvironment
} from '~shared/runtime-environment-store'
import {
  redactRuntimeEnvironment,
  type PublicKnownRuntimeEnvironment
} from '~shared/runtime-environments'
import type { RuntimeStatus } from '~shared/runtime-types'

import type { Store } from '../persistence'
import { clearActiveRuntimeEnvironmentFocusIfMatches } from '../runtime-environment-focus-self-heal'
import { closeRemoteRuntimeRequestConnection } from './environment-request-connections'
import {
  clearSharedControlSupport,
  getRuntimeEnvironmentStatus,
  resetSharedControlSupport
} from './environment-transport-routing'
import { getRuntimeHostPathsProvider } from './host/paths-provider'

let environmentRegistryStore: Store | null = null

export function initializeRuntimeEnvironmentRegistry(store: Store): void {
  environmentRegistryStore = store
  resetSharedControlSupport()
}

export function listPublicRuntimeEnvironments(): PublicKnownRuntimeEnvironment[] {
  // Why: `source` is persisted on the env record, so read it directly instead of
  // joining the VM store — a corrupt VM store must not break listing all envs.
  return listEnvironments(getUserDataPath()).map(redactRuntimeEnvironment)
}

export function resolvePublicRuntimeEnvironment(selector: string): PublicKnownRuntimeEnvironment {
  return redactRuntimeEnvironment(resolveEnvironment(getUserDataPath(), selector))
}

export function removePublicRuntimeEnvironment(selector: string): {
  removed: PublicKnownRuntimeEnvironment
} {
  const removed = removeEnvironment(getUserDataPath(), selector)
  closeEnvironmentConnections(selector, removed.id)
  clearActiveRuntimeEnvironmentFocusIfMatches(requireEnvironmentRegistryStore(), removed.id)
  return { removed: redactRuntimeEnvironment(removed) }
}

export function disconnectPublicRuntimeEnvironment(selector: string): {
  disconnected: PublicKnownRuntimeEnvironment
} {
  const environment = resolveEnvironment(getUserDataPath(), selector)
  // Why: disconnect is intentionally non-destructive; it drops live
  // transport state while keeping the paired server available for later.
  closeEnvironmentConnections(selector, environment.id)
  return { disconnected: redactRuntimeEnvironment(environment) }
}

export function getPublicRuntimeEnvironmentStatus(
  selector: string,
  timeoutMs?: number
): Promise<RuntimeRpcResponse<RuntimeStatus>> {
  return getRuntimeEnvironmentStatus(getUserDataPath(), selector, timeoutMs)
}

function closeEnvironmentConnections(selector: string, environmentId: string): void {
  closeRemoteRuntimeRequestConnection(environmentId)
  clearSharedControlSupport(environmentId)
  if (selector !== environmentId) {
    closeRemoteRuntimeRequestConnection(selector)
    clearSharedControlSupport(selector)
  }
}

function getUserDataPath(): string {
  return getRuntimeHostPathsProvider().userDataPath()
}

function requireEnvironmentRegistryStore(): Store {
  if (!environmentRegistryStore) {
    throw new Error('Runtime environment registry is unavailable')
  }
  return environmentRegistryStore
}
