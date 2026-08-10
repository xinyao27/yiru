import type { GitLabWorkItem } from '@yiru/workbench-model/review'
import type { GitHubWorkItem } from '@yiru/workbench-model/review'
import type { BaseRefSearchResult } from '@yiru/workbench-model/workspace'

import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc } from '~/transport/runtime-orpc-client'

import type { MrStateFilter } from './composer-source-types'
import { PER_REPO_FETCH_LIMIT } from './work-items'

const GITLAB_PER_PAGE = 50
const BRANCH_LIMIT = 20

export function scopeGitHubQuery(query: string): string {
  const trimmed = query.trim()
  return trimmed ? `is:pr ${trimmed}` : 'is:pr'
}

export async function searchGitHubItems(
  client: RpcClient,
  repoId: string,
  query: string
): Promise<GitHubWorkItem[]> {
  const envelope = await callRuntimeOrpc(client, (runtime) => runtime.github.listWorkItems, {
    repo: `id:${repoId}`,
    limit: PER_REPO_FETCH_LIMIT,
    query: scopeGitHubQuery(query)
  })
  return (envelope.items ?? []).map((item) => ({ ...item, repoId }))
}

export async function searchGitLabItems(
  client: RpcClient,
  repoId: string,
  query: string,
  state: MrStateFilter
): Promise<GitLabWorkItem[]> {
  const envelope = await callRuntimeOrpc(client, (runtime) => runtime.gitlab.listMRs, {
    repo: `id:${repoId}`,
    state,
    page: 1,
    perPage: GITLAB_PER_PAGE,
    query: query.trim() || undefined
  })
  if (envelope.error?.type && envelope.error.type !== 'not_found') {
    throw new Error(envelope.error.message)
  }
  return (envelope.items ?? []).map((item) => ({ ...item, repoId }))
}

export async function searchBranches(
  client: RpcClient,
  repoId: string,
  query: string
): Promise<BaseRefSearchResult[]> {
  const result = await callRuntimeOrpc(
    client,
    (runtime) => runtime.repo.searchRefs,
    { repo: `id:${repoId}`, query: query.trim(), limit: BRANCH_LIMIT },
    { timeoutMs: 30_000 }
  )
  return (
    result.refDetails ??
    (result.refs ?? []).map((refName) => ({ refName, localBranchName: refName }))
  )
}
