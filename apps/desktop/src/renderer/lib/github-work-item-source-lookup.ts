import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import type { ProjectSourceContext } from '~shared/project-source-context'
import type { GitHubWorkItem, GitHubWorkItemDetails } from '~shared/types'

import {
  getGitHubRuntimeRepoId,
  getGitHubSourceRuntimeHost,
  getGitHubSourceRuntimeTarget
} from './github-source-runtime-context'

type GitHubWorkItemLookupArgs = {
  repoPath: string
  repoId: string
  sourceContext?: ProjectSourceContext | null
  number: number
  type?: 'pr'
}

type GitHubWorkItemByOwnerRepoLookupArgs = GitHubWorkItemLookupArgs & {
  owner: string
  repo: string
  type: 'pr'
}

type GitHubWorkItemDetailsLookupArgs = {
  repoPath: string
  repoId: string
  sourceContext?: ProjectSourceContext | null
  number: number
  type: 'pr'
}

function runtimeRepoId(args: Pick<GitHubWorkItemLookupArgs, 'repoId' | 'sourceContext'>): string {
  return getGitHubRuntimeRepoId(args.sourceContext, args.repoId)
}

export async function lookupGitHubWorkItemForSource(
  args: GitHubWorkItemLookupArgs
): Promise<GitHubWorkItem | null> {
  const target = getGitHubSourceRuntimeTarget(args.sourceContext)
  const item = await callRuntimeOrpc(
    target,
    (client) => client.github.workItem,
    { repo: runtimeRepoId(args), number: args.number, type: args.type },
    { timeoutMs: 30_000 }
  )
  return item ? ({ ...item, repoId: args.repoId } as GitHubWorkItem) : null
}

export async function lookupGitHubWorkItemByOwnerRepoForSource(
  args: GitHubWorkItemByOwnerRepoLookupArgs
): Promise<GitHubWorkItem | null> {
  const target = getGitHubSourceRuntimeTarget(args.sourceContext)
  const item = await callRuntimeOrpc(
    target,
    (client) => client.github.workItemByOwnerRepo,
    {
      repo: runtimeRepoId(args),
      owner: args.owner,
      ownerRepo: args.repo,
      number: args.number,
      type: args.type
    },
    { timeoutMs: 30_000 }
  )
  return item ? ({ ...item, repoId: args.repoId } as GitHubWorkItem) : null
}

export function lookupGitHubWorkItemDetailsForSource(
  args: GitHubWorkItemDetailsLookupArgs
): Promise<GitHubWorkItemDetails | null> {
  const sourceContext = args.sourceContext
  const runtimeHost = getGitHubSourceRuntimeHost(sourceContext)
  return callRuntimeOrpc(
    runtimeHost
      ? { kind: 'environment', environmentId: runtimeHost.environmentId }
      : { kind: 'local' },
    (client) => client.github.workItemDetails,
    {
      repo: getGitHubRuntimeRepoId(sourceContext, args.repoId),
      number: args.number,
      type: args.type
    },
    { timeoutMs: 30_000 }
  )
}
