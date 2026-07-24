import { legacyBaseRefSearchResult } from '@yiru/workbench-model/review'
import type { ExecutionHostId } from '@yiru/workbench-model/workspace'

import { REPO_SEARCH_REFS_CONTRACT } from '../../../shared/runtime-method-contracts/workspace-contracts'
import type { BaseRefSearchResult, GlobalSettings } from '../../../shared/types'
import { isRuntimeRepoRefSearchQueryWithinLimit } from './runtime-repo-search-bounds'
import { callRuntimeRpc, getActiveRuntimeTarget } from './runtime-rpc-client'

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
  if (target.kind !== 'environment') {
    return window.api.repos.getBaseRefDefault({ repoId, ...(hostId ? { hostId } : {}) })
  }
  return callRuntimeRpc<RuntimeRepoBaseRefDefault>(
    target,
    'repo.baseRefDefault',
    { repo: repoId },
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
  if (target.kind !== 'environment') {
    return window.api.repos.searchBaseRefs({ repoId, query, limit, ...(hostId ? { hostId } : {}) })
  }
  const result = await callRuntimeRpc(
    target,
    REPO_SEARCH_REFS_CONTRACT,
    { repo: repoId, query, limit },
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
  if (target.kind !== 'environment') {
    return window.api.repos.searchBaseRefDetails({
      repoId,
      query,
      limit,
      ...(hostId ? { hostId } : {})
    })
  }
  const result = await callRuntimeRpc(
    target,
    REPO_SEARCH_REFS_CONTRACT,
    { repo: repoId, query, limit },
    { timeoutMs: 15_000 }
  )
  return result.refDetails ?? result.refs.map(legacyBaseRefSearchResult)
}
