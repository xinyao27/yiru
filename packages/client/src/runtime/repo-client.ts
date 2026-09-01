import { legacyBaseRefSearchResult } from '@yiru/runtime-protocol/model/review'
import type { ExecutionHostId } from '@yiru/runtime-protocol/model/workspace'
import type { BaseRefSearchResult, GlobalSettings } from '@yiru/runtime-protocol/workbench/types'

import { callRuntimeOrpc } from './orpc-client'
import { isRuntimeRepoRefSearchQueryWithinLimit } from './repo-search-bounds'
import { getActiveRuntimeTarget } from './rpc-client'

export type RuntimeRepoBaseRefDefault = {
  defaultBaseRef: string | null
  remoteCount: number
}

export async function getRuntimeRepoBaseRefDefault(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  repoId: string,
  hostId?: ExecutionHostId
): Promise<RuntimeRepoBaseRefDefault> {
  const target = getActiveRuntimeTarget(settings)
  return callRuntimeOrpc(
    target,
    (client) => client.repo.baseRefDefault,
    // Why: a repoId can collide across execution hosts within a local store
    // (host OS vs a WSL distro); a paired environment's own store has no
    // "disambiguate by hostId" concept, so hostId is local-only.
    { repo: repoId, ...(target.kind === 'local' && hostId ? { hostId } : {}) },
    { timeoutMs: 15_000 }
  )
}

export async function searchRuntimeRepoBaseRefs(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  repoId: string,
  query: string,
  limit: number,
  hostId?: ExecutionHostId
): Promise<string[]> {
  if (!isRuntimeRepoRefSearchQueryWithinLimit(query)) {
    return []
  }
  const target = getActiveRuntimeTarget(settings)
  const result = await callRuntimeOrpc(
    target,
    (client) => client.repo.searchRefs,
    { repo: repoId, query, limit, ...(target.kind === 'local' && hostId ? { hostId } : {}) },
    { timeoutMs: 15_000 }
  )
  return result.refs
}

export async function searchRuntimeRepoBaseRefDetails(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  repoId: string,
  query: string,
  limit: number,
  hostId?: ExecutionHostId
): Promise<BaseRefSearchResult[]> {
  if (!isRuntimeRepoRefSearchQueryWithinLimit(query)) {
    return []
  }
  const target = getActiveRuntimeTarget(settings)
  const result = await callRuntimeOrpc(
    target,
    (client) => client.repo.searchRefs,
    { repo: repoId, query, limit, ...(target.kind === 'local' && hostId ? { hostId } : {}) },
    { timeoutMs: 15_000 }
  )
  return result.refDetails ?? result.refs.map(legacyBaseRefSearchResult)
}
