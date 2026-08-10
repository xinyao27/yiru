import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import type { ProjectSourceContext } from '~shared/project-source-context'
import { getProjectSourceRuntimeSettings } from '~shared/project-source-context'
import type { GitLabWorkItem, ListMergeRequestsResult } from '~shared/types'

type GitLabSourceLookupArgs = {
  repoPath: string
  repoId: string
  sourceContext?: ProjectSourceContext | null
}

type GitLabWorkItemByPathLookupArgs = GitLabSourceLookupArgs & {
  host: string
  path: string
  iid: number
  type: 'mr'
}

type GitLabMRListLookupArgs = GitLabSourceLookupArgs & {
  state?: 'opened' | 'merged' | 'closed' | 'all'
  page?: number
  perPage?: number
  query?: string
}

function runtimeRepoId(args: Pick<GitLabSourceLookupArgs, 'repoId' | 'sourceContext'>): string {
  return args.sourceContext?.repoId ?? args.repoId
}

function withRendererRepoId(item: Omit<GitLabWorkItem, 'repoId'> | GitLabWorkItem, repoId: string) {
  return { ...item, repoId } as GitLabWorkItem
}

export async function lookupGitLabWorkItemByPathForSource(
  args: GitLabWorkItemByPathLookupArgs
): Promise<GitLabWorkItem | null> {
  const target = getActiveRuntimeTarget(getProjectSourceRuntimeSettings(args.sourceContext))
  const item = await callRuntimeOrpc(
    target,
    (client) => client.gitlab.workItemByPath,
    {
      repo: runtimeRepoId(args),
      host: args.host,
      path: args.path,
      iid: args.iid,
      type: args.type
    },
    { timeoutMs: 30_000 }
  )
  return item ? withRendererRepoId(item, args.repoId) : null
}

export async function listGitLabMRsForSource(
  args: GitLabMRListLookupArgs
): Promise<ListMergeRequestsResult> {
  const target = getActiveRuntimeTarget(getProjectSourceRuntimeSettings(args.sourceContext))
  const result = await callRuntimeOrpc(
    target,
    (client) => client.gitlab.listMRs,
    {
      repo: runtimeRepoId(args),
      state: args.state,
      page: args.page,
      perPage: args.perPage,
      query: args.query
    },
    { timeoutMs: 30_000 }
  )
  return {
    ...result,
    items: result.items.map((item) => withRendererRepoId(item, args.repoId))
  }
}
