import type { BaseRefSearchResult, GitHubWorkItem, GitLabWorkItem } from '../../../src/shared/types'
import type { RpcClient } from '../transport/rpc-client'
import type { RpcSuccess } from '../transport/types'
import { PER_REPO_FETCH_LIMIT } from './mobile-work-items'
import type { MrStateFilter } from './mobile-composer-source-types'

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
  const response = await client.sendRequest('github.listWorkItems', {
    repo: `id:${repoId}`,
    limit: PER_REPO_FETCH_LIMIT,
    query: scopeGitHubQuery(query)
  })
  if (!response.ok) {
    throw new Error(response.error.message)
  }
  const envelope = (response as RpcSuccess).result as { items: GitHubWorkItem[] }
  return (envelope.items ?? []).map((item) => ({ ...item, repoId }))
}

export async function searchGitLabItems(
  client: RpcClient,
  repoId: string,
  query: string,
  state: MrStateFilter
): Promise<GitLabWorkItem[]> {
  const response = await client.sendRequest('gitlab.listMRs', {
    repo: `id:${repoId}`,
    state,
    page: 1,
    perPage: GITLAB_PER_PAGE,
    query: query.trim() || undefined
  })
  if (!response.ok) {
    throw new Error(response.error.message)
  }
  const envelope = (response as RpcSuccess).result as {
    items: GitLabWorkItem[]
    error?: { type?: string; message: string }
  }
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
  const response = await client.sendRequest(
    'repo.searchRefs',
    { repo: `id:${repoId}`, query: query.trim(), limit: BRANCH_LIMIT },
    { timeoutMs: 30_000 }
  )
  if (!response.ok) {
    throw new Error(response.error.message)
  }
  const result = (response as RpcSuccess).result as {
    refDetails?: BaseRefSearchResult[]
    refs?: string[]
  }
  return (
    result.refDetails ??
    (result.refs ?? []).map((refName) => ({ refName, localBranchName: refName }))
  )
}
