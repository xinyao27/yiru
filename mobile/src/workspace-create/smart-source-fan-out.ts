import type { BaseRefSearchResult, GitHubWorkItem, GitLabWorkItem } from '../../../src/shared/types'
import {
  isSmartWorkspaceSourceQueryWithinLimit,
  type SmartNameMode
} from '../../../src/shared/new-workspace/smart-workspace-source-results'
import type { RpcClient } from '../transport/rpc-client'
import { isGitHubWorkItemsSshRemoteRequiredError } from './mobile-work-items'
import type { MrStateFilter } from './mobile-composer-source-types'
import {
  searchBranches,
  searchGitHubItems,
  searchGitLabItems
} from './smart-source-search-requests'

export type SmartFanOutResult = {
  githubItems: GitHubWorkItem[]
  gitlabItems: GitLabWorkItem[]
  branches: BaseRefSearchResult[]
  needsGitHubRemote: boolean
  error: string
}

const EMPTY: Omit<SmartFanOutResult, 'needsGitHubRemote' | 'error'> = {
  githubItems: [],
  gitlabItems: [],
  branches: []
}

type FanOutArgs = {
  client: RpcClient
  mode: SmartNameMode
  query: string
  repoId: string | null
  githubAvailable: boolean
  gitlabAvailable: boolean
  mrStateFilter: MrStateFilter
}

export async function fanOutSmartSearch(args: FanOutArgs): Promise<SmartFanOutResult> {
  if (!isSmartWorkspaceSourceQueryWithinLimit(args.query)) {
    return { ...EMPTY, needsGitHubRemote: false, error: '' }
  }
  const { client, mode, query, repoId, githubAvailable, gitlabAvailable, mrStateFilter } = args
  const isSmart = mode === 'smart'
  const github =
    githubAvailable && repoId && (mode === 'smart' || mode === 'github')
      ? searchGitHubItems(client, repoId, query)
      : Promise.resolve<GitHubWorkItem[]>([])
  const gitlab =
    gitlabAvailable && repoId && (mode === 'smart' || mode === 'gitlab')
      ? searchGitLabItems(client, repoId, query, mrStateFilter)
      : Promise.resolve<GitLabWorkItem[]>([])
  const branches =
    repoId && (mode === 'branches' || (mode === 'smart' && query.trim().length > 0))
      ? searchBranches(client, repoId, query)
      : Promise.resolve<BaseRefSearchResult[]>([])
  const [githubResult, gitlabResult, branchResult] = await Promise.allSettled([
    github,
    gitlab,
    branches
  ])

  let needsGitHubRemote = false
  let error = ''
  const fail = (reason: unknown) => {
    if (!isSmart) {
      error = reason instanceof Error ? reason.message : 'Search failed'
    }
  }
  if (githubResult.status === 'rejected') {
    if (isGitHubWorkItemsSshRemoteRequiredError(githubResult.reason)) {
      needsGitHubRemote = true
    } else {
      fail(githubResult.reason)
    }
  }
  if (gitlabResult.status === 'rejected') {
    fail(gitlabResult.reason)
  }
  if (branchResult.status === 'rejected') {
    fail(branchResult.reason)
  }

  return {
    ...EMPTY,
    githubItems: githubResult.status === 'fulfilled' ? githubResult.value : [],
    gitlabItems: gitlabResult.status === 'fulfilled' ? gitlabResult.value : [],
    branches: branchResult.status === 'fulfilled' ? branchResult.value : [],
    needsGitHubRemote,
    error
  }
}
