import {
  normalizeExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '@yiru/runtime-protocol/model/workspace'
import {
  getProjectSourceCacheScope,
  getProjectSourceRuntimeSettings,
  type ProjectSourceContext
} from '@yiru/runtime-protocol/workbench/project-source-context'
import type {
  GitHubWorkItem,
  ListWorkItemsResult,
  Repo
} from '@yiru/runtime-protocol/workbench/types'
import { callRuntimeOrpc, type RuntimeClientTarget } from '~renderer/runtime/orpc-client'
import type { AppState } from '~renderer/store/types'

import { workItemsCacheKey } from './cache-policy'
import {
  findRepoForGitHubOwner,
  getGitHubFocusedRepoOwnerHostId,
  getRuntimeRepoTarget,
  settingsForGitHubFocusedRepoOwner,
  settingsForGitHubRepoOwner
} from './repo-owner'

export type GitHubWorkItemRequestTarget =
  | { kind: 'environment'; environmentId: string; runtimeRepoId: string }
  | { kind: 'local' }

export type GitHubWorkItemRequestContext = {
  repoId: string
  repoPath: string
  target: GitHubWorkItemRequestTarget
}

type GitHubWorkItemsListArgs = {
  limit: number
  query?: string
  page?: number
  noCache?: true
}

export function getWorkItemsCacheKeyForOwner(
  state: Partial<Pick<AppState, 'repos' | 'settings'>>,
  repoId: string,
  limit: number,
  query: string,
  repoPath?: string
): string {
  const repo = findRepoForGitHubOwner(state, repoId, repoPath ?? '')
  return workItemsCacheKey(
    repoId,
    limit,
    query,
    repo ? getGitHubFocusedRepoOwnerHostId(state.settings ?? null, repo) : undefined
  )
}

export function getGitHubWorkItemSourceHostId(
  state: AppState,
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined,
  sourceContext?: ProjectSourceContext | null
): ExecutionHostId | undefined {
  if (sourceContext?.provider === 'github') {
    return sourceContext.hostId
  }
  return repo
    ? (normalizeExecutionHostId(getGitHubFocusedRepoOwnerHostId(state.settings, repo)) ?? undefined)
    : undefined
}

export function getGitHubWorkItemSourceCacheScope(
  state: AppState,
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined,
  sourceContext?: ProjectSourceContext | null
): string | undefined {
  return sourceContext?.provider === 'github'
    ? getProjectSourceCacheScope(sourceContext)
    : getGitHubWorkItemSourceHostId(state, repo, sourceContext)
}

export function getGitHubWorkItemSourceSettings(
  settings: AppState['settings'],
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined,
  sourceContext?: ProjectSourceContext | null
): AppState['settings'] {
  return sourceContext?.provider === 'github'
    ? ({ ...settings, ...getProjectSourceRuntimeSettings(sourceContext) } as AppState['settings'])
    : settingsForGitHubFocusedRepoOwner(settings, repo)
}

export function getGitHubRepoSourceSettings(
  settings: AppState['settings'],
  repo: Pick<Repo, 'connectionId' | 'executionHostId'> | undefined,
  sourceContext?: ProjectSourceContext | null
): AppState['settings'] {
  return sourceContext?.provider === 'github'
    ? ({ ...settings, ...getProjectSourceRuntimeSettings(sourceContext) } as AppState['settings'])
    : settingsForGitHubRepoOwner(settings, repo)
}

export function getGitHubWorkItemRequestContext(
  state: AppState,
  settings: AppState['settings'],
  repoId: string,
  repoPath: string,
  sourceContext?: ProjectSourceContext | null
): GitHubWorkItemRequestContext {
  if (sourceContext?.provider === 'github') {
    const parsedHost = parseExecutionHostId(sourceContext.hostId)
    if (parsedHost?.kind === 'runtime') {
      return {
        repoId,
        repoPath,
        target: {
          kind: 'environment',
          environmentId: parsedHost.environmentId,
          runtimeRepoId: sourceContext.repoId ?? repoId
        }
      }
    }
  }
  const runtimeRepo = getRuntimeRepoTarget(state, repoPath, settings)
  return {
    repoId,
    repoPath,
    target: runtimeRepo
      ? {
          kind: 'environment',
          environmentId: runtimeRepo.target.environmentId,
          runtimeRepoId: runtimeRepo.repo.id
        }
      : { kind: 'local' }
  }
}

export function githubRuntimeRequest(context: GitHubWorkItemRequestContext): {
  target: RuntimeClientTarget
  repo: string
} {
  return context.target.kind === 'environment'
    ? {
        target: { kind: 'environment', environmentId: context.target.environmentId },
        repo: context.target.runtimeRepoId
      }
    : { target: { kind: 'local' }, repo: context.repoId }
}

export function listGitHubWorkItemsForRepo(
  context: GitHubWorkItemRequestContext,
  args: GitHubWorkItemsListArgs
): Promise<ListWorkItemsResult<Omit<GitHubWorkItem, 'repoId'>>> {
  const { target, repo } = githubRuntimeRequest(context)
  return callRuntimeOrpc(
    target,
    (client) => client.github.listWorkItems,
    { repo, ...args },
    { timeoutMs: 30_000 }
  )
}
