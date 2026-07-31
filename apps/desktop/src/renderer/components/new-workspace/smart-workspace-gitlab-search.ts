import type { GitLabWorkItem } from '~shared/types'

import type { MrStateFilter } from './smart-workspace-localized-options'

// Why: the smart-name field's GitLab search has exactly one active shape at
// a time — resolve a pasted MR link, or list the target repos' MRs — and the
// two used to be split across two effects that cleared each other's state
// defensively. Tagging the stored items with which shape (and which
// query/targets/state-filter) produced them turns that mutual-clobber guard
// into a plain render-time comparison: a stale batch's tag just won't match
// the live request, including when repoBackedSearchTargets changes while the
// field sits disabled (the mode tabs stay reachable even then).
export type SmartWorkspaceGitlabSearchRequest =
  | {
      kind: 'paste-lookup'
      query: string
      targetRepoIds: readonly string[]
      host: string
      path: string
      iid: number
    }
  | {
      kind: 'list'
      query: string
      targetRepoIds: readonly string[]
      mrStateFilter: MrStateFilter
    }

// Why: plain (not readonly) to match buildSmartWorkspaceSourceRows's existing
// gitlabItems: GitLabWorkItem[] parameter shape.
const EMPTY_GITLAB_ITEMS: GitLabWorkItem[] = []

function gitlabRequestKey(request: SmartWorkspaceGitlabSearchRequest): string {
  switch (request.kind) {
    case 'paste-lookup':
      return `paste-lookup:${request.query}:${request.targetRepoIds.join(',')}:${request.host}:${request.path}:${request.iid}`
    case 'list':
      return `list:${request.query}:${request.targetRepoIds.join(',')}:${request.mrStateFilter}`
  }
}

export function gitlabSearchRequestsEqual(
  a: SmartWorkspaceGitlabSearchRequest | null,
  b: SmartWorkspaceGitlabSearchRequest | null
): boolean {
  if (a === null || b === null) {
    return a === null && b === null
  }
  return gitlabRequestKey(a) === gitlabRequestKey(b)
}

export function getVisibleGitlabItems({
  items,
  currentRequest,
  resultRequest
}: {
  items: GitLabWorkItem[]
  currentRequest: SmartWorkspaceGitlabSearchRequest | null
  resultRequest: SmartWorkspaceGitlabSearchRequest | null
}): GitLabWorkItem[] {
  if (currentRequest === null) {
    return EMPTY_GITLAB_ITEMS
  }
  return gitlabSearchRequestsEqual(currentRequest, resultRequest) ? items : EMPTY_GITLAB_ITEMS
}

export function getGitlabSearchRequest({
  shouldQueryGitlab,
  disabled,
  hasGitlabHandler,
  query,
  targetRepoIds,
  parsedLink,
  mrStateFilter
}: {
  shouldQueryGitlab: boolean
  disabled: boolean
  hasGitlabHandler: boolean
  query: string
  targetRepoIds: readonly string[]
  parsedLink: { slug: { host: string; path: string }; number: number } | null
  mrStateFilter: MrStateFilter
}): SmartWorkspaceGitlabSearchRequest | null {
  if (!shouldQueryGitlab || disabled || !hasGitlabHandler) {
    return null
  }
  if (parsedLink !== null) {
    return {
      kind: 'paste-lookup',
      query,
      targetRepoIds,
      host: parsedLink.slug.host,
      path: parsedLink.slug.path,
      iid: parsedLink.number
    }
  }
  return { kind: 'list', query, targetRepoIds, mrStateFilter }
}
