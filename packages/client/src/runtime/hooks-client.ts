import type { ExecutionHostId } from '@yiru/workbench-model/workspace'
import type { SetupScriptImportCandidate } from '~shared/setup/script-imports'
import type { GlobalSettings, YiruHooks } from '~shared/types'

import { callRuntimeOrpc } from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'

export type HookCheckResult = {
  status?: 'ok' | 'error'
  hasHooks: boolean
  hooks: YiruHooks | null
  mayNeedUpdate: boolean
}

export async function checkRuntimeHooks(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  repoId: string,
  hostId?: ExecutionHostId
): Promise<HookCheckResult> {
  const target = getActiveRuntimeTarget(settings)
  // Why: hostId disambiguates repoId collisions inside a single store. A
  // `local` target is this desktop's own store, which can hold repo records
  // for other hosts too, so hostId is meaningful there. An `environment`
  // target is a *different* runtime's own store, which has no concept of
  // other hosts from its own point of view — forwarding hostId there could
  // filter out that environment's own local repos.
  return callRuntimeOrpc(
    target,
    (client) => client.repo.hooksCheck,
    { repo: repoId, ...(target.kind === 'local' && hostId ? { hostId } : {}) },
    { timeoutMs: 15_000 }
  )
}

export async function inspectRuntimeSetupScriptImports(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  repoId: string
): Promise<SetupScriptImportCandidate[]> {
  const target = getActiveRuntimeTarget(settings)
  return callRuntimeOrpc(
    target,
    (client) => client.repo.setupScriptImports,
    { repo: repoId },
    { timeoutMs: 15_000 }
  )
}
