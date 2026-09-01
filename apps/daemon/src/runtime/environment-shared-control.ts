import {
  REMOTE_RUNTIME_SHARED_CONTROL_CAPABILITY,
  RUNTIME_ORPC_RUNTIME_CAPABILITY
} from '@yiru/runtime-protocol/protocol-version'
import { STATUS_GET_CONTRACT } from '@yiru/runtime-protocol/status'
import type { getPreferredPairingOffer } from '@yiru/runtime-protocol/workbench/runtime-environments'
import type { KnownRuntimeEnvironment } from '@yiru/runtime-protocol/workbench/runtime-environments'
import { sendRemoteRuntimeRequest } from '~main/remote-runtime/client'
import { markEnvironmentUsed } from '~main/runtime-environment-store'

type RuntimeSharedControlSupport = {
  sharedControl: boolean
  orpc: boolean
}

const sharedControlSupport = new Map<
  string,
  { cacheKey: string; check: Promise<RuntimeSharedControlSupport> }
>()

export function resetSharedControlSupport(): void {
  sharedControlSupport.clear()
}

export function clearSharedControlSupport(environmentId: string): void {
  sharedControlSupport.delete(environmentId)
}

export async function supportsSharedControl(
  userDataPath: string,
  environment: KnownRuntimeEnvironment,
  pairing: ReturnType<typeof getPreferredPairingOffer>,
  timeoutMs: number
): Promise<boolean> {
  return (await getSharedControlSupport(userDataPath, environment, pairing, timeoutMs))
    .sharedControl
}

// Why: a `false` here is load-bearing for correctness, not just for transport
// choice. Callers fall back to the bare-envelope legacy path, and Phase 6 has
// retired the legacy twin of most methods — so a wrong `false` against a
// current peer is `method_not_found`, not a slower success. Two cases keep
// that safe and must stay that way: a peer that genuinely lacks the oRPC
// capability is an older build that still owns its legacy registrations, and a
// transport failure *rejects* (`sendRemoteRuntimeRequest` calls `reject`, never
// `resolve({ok:false})`), which `getSharedControlSupport` turns into a cache
// eviction rather than a cached `false`. Do not "helpfully" convert a thrown
// probe error into a negative result: that would pin an environment to a dead
// path until re-pair.
export async function supportsRuntimeOrpcTunnel(
  userDataPath: string,
  environment: KnownRuntimeEnvironment,
  pairing: ReturnType<typeof getPreferredPairingOffer>,
  timeoutMs: number
): Promise<boolean> {
  const support = await getSharedControlSupport(userDataPath, environment, pairing, timeoutMs)
  return support.sharedControl && support.orpc
}

async function getSharedControlSupport(
  userDataPath: string,
  environment: KnownRuntimeEnvironment,
  pairing: ReturnType<typeof getPreferredPairingOffer>,
  timeoutMs: number
): Promise<RuntimeSharedControlSupport> {
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
    if (response.ok !== true) {
      return { sharedControl: false, orpc: false }
    }
    markEnvironmentUsed(userDataPath, environment.id, { runtimeId: response._meta.runtimeId })
    resolvedCacheKey = getSharedControlSupportCacheKey(
      environment,
      pairing,
      response._meta.runtimeId
    )
    return {
      sharedControl:
        response.result.capabilities?.includes(REMOTE_RUNTIME_SHARED_CONTROL_CAPABILITY) === true,
      orpc: response.result.capabilities?.includes(RUNTIME_ORPC_RUNTIME_CAPABILITY) === true
    }
  })()
  sharedControlSupport.set(environment.id, { cacheKey, check })
  try {
    const support = await check
    const cachedAfterCheck = sharedControlSupport.get(environment.id)
    if (cachedAfterCheck?.check === check && cachedAfterCheck.cacheKey !== resolvedCacheKey) {
      sharedControlSupport.set(environment.id, { cacheKey: resolvedCacheKey, check })
    }
    return support
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
