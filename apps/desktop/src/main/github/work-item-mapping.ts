import type { PRMergeableState, PRReviewDecision, GitHubWorkItem } from '~shared/types'

import type { OwnerRepo } from './github-cli'

export type MainWorkItem = Omit<GitHubWorkItem, 'repoId'>

// Why: pull request numbers follow creation order within a repository. Pinning
// this sort keeps list results stable across paginated searches.
export const WORK_ITEM_NUMBER_SORT_QUALIFIER = 'sort:created-desc'

export const WORK_ITEM_PR_LIST_JSON_FIELDS =
  'number,title,state,url,labels,updatedAt,author,isDraft,headRefName,baseRefName,headRefOid,headRepositoryOwner,reviewRequests'

// Why: these fields are intentionally excluded from `gh pr list` because
// statusCheckRollup/review decision/PR-specific merge metadata fan out into
// expensive GraphQL work across every row. Requested reviewers are kept in the
// list payload because the pull-request picker renders that column on first paint.
export const WORK_ITEM_PR_DETAIL_JSON_FIELDS =
  'number,title,state,url,labels,updatedAt,author,isDraft,headRefName,baseRefName,headRefOid,headRepositoryOwner,additions,deletions,changedFiles,reviewDecision,reviewRequests,latestReviews,assignees,statusCheckRollup,mergeable,mergeStateStatus,autoMergeRequest,maintainerCanModify'

/**
 * Derive both the author login and its API avatar_url in one place so GHE
 * avatars render (the login-only `github.com/{login}.png` URL 404s on GHE).
 *
 * REST exposes `user.avatar_url`; gh/GraphQL expose `author.avatarUrl`. `gh pr
 * view` omits the avatar entirely, so authorAvatarUrl is left undefined and the
 * UI falls back to the login URL then a placeholder. See #8784.
 */
export function authorFieldsFromUnknown(
  item: Record<string, unknown>
): Pick<MainWorkItem, 'author' | 'authorAvatarUrl'> {
  const user = userFromUnknown(item.user ?? item.author)
  if (!user) {
    return { author: null }
  }
  return {
    author: user.login,
    ...(user.avatarUrl ? { authorAvatarUrl: user.avatarUrl } : {})
  }
}

export function extractHeadOwnerLogin(item: Record<string, unknown>): string | null {
  // gh CLI `pr list --json headRepositoryOwner` shape: { login }
  if (typeof item.headRepositoryOwner === 'object' && item.headRepositoryOwner !== null) {
    const login = (item.headRepositoryOwner as { login?: unknown }).login
    if (typeof login === 'string' && login.trim()) {
      return login
    }
  }
  // REST API `pull_request` shape: head.repo.owner.login
  if (typeof item.head === 'object' && item.head !== null) {
    const head = item.head as { repo?: unknown; user?: unknown; label?: unknown }
    const repo = head.repo
    if (typeof repo === 'object' && repo !== null) {
      const owner = (repo as { owner?: unknown }).owner
      if (typeof owner === 'object' && owner !== null) {
        const login = (owner as { login?: unknown }).login
        if (typeof login === 'string' && login.trim()) {
          return login
        }
      }
    }
    // Why: when a fork is deleted or made inaccessible, GitHub can return
    // `head.repo = null` but still include `head.user`/`head.label`.
    const user = head.user
    if (typeof user === 'object' && user !== null) {
      const login = (user as { login?: unknown }).login
      if (typeof login === 'string' && login.trim()) {
        return login
      }
    }
    if (typeof head.label === 'string') {
      const owner = head.label.split(':', 1)[0]?.trim()
      if (owner) {
        return owner
      }
    }
  }
  return null
}

export function userFromUnknown(
  value: unknown
): { login: string; name: string | null; avatarUrl: string } | null {
  if (typeof value === 'string') {
    const login = value.trim()
    return login ? { login, name: null, avatarUrl: '' } : null
  }
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const raw = value as Record<string, unknown>
  const login = typeof raw.login === 'string' ? raw.login.trim() : ''
  if (!login) {
    return null
  }
  const databaseId = numberFromUnknown(raw.databaseId)
  return {
    login,
    name: typeof raw.name === 'string' ? raw.name : null,
    avatarUrl:
      typeof raw.avatarUrl === 'string'
        ? raw.avatarUrl
        : typeof raw.avatar_url === 'string'
          ? raw.avatar_url
          : databaseId !== undefined
            ? `https://avatars.githubusercontent.com/u/${databaseId}?v=4`
            : ''
  }
}

export function usersFromUnknown(
  value: unknown
): { login: string; name: string | null; avatarUrl: string }[] {
  if (!Array.isArray(value)) {
    return []
  }
  const users: { login: string; name: string | null; avatarUrl: string }[] = []
  for (const entry of value) {
    const direct = userFromUnknown(entry)
    if (direct) {
      users.push(direct)
      continue
    }
    if (typeof entry === 'object' && entry !== null) {
      const raw = entry as Record<string, unknown>
      const nested = userFromUnknown(raw.requestedReviewer ?? raw.user ?? raw.author)
      if (nested) {
        users.push(nested)
      }
    }
  }
  return users
}

export function latestReviewsFromUnknown(
  value: unknown
): NonNullable<GitHubWorkItem['latestReviews']> {
  if (!Array.isArray(value)) {
    return []
  }
  const reviews: NonNullable<GitHubWorkItem['latestReviews']> = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) {
      continue
    }
    const raw = entry as Record<string, unknown>
    const author = userFromUnknown(raw.author)
    if (!author) {
      continue
    }
    reviews.push({
      login: author.login,
      state: typeof raw.state === 'string' ? raw.state : null,
      avatarUrl: author.avatarUrl
    })
  }
  return reviews
}

export function numberFromUnknown(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : undefined
}

export function normalizePRMergeable(value: unknown): PRMergeableState | undefined {
  const raw = typeof value === 'string' ? value.toUpperCase() : ''
  if (raw === 'MERGEABLE' || raw === 'CONFLICTING' || raw === 'UNKNOWN') {
    return raw
  }
  if (typeof value === 'boolean') {
    return value ? 'MERGEABLE' : 'CONFLICTING'
  }
  return undefined
}

export function normalizeReviewDecision(value: unknown): PRReviewDecision | null {
  return value === 'APPROVED' || value === 'CHANGES_REQUESTED' || value === 'REVIEW_REQUIRED'
    ? value
    : null
}

export function isAutoMergeEnabled(value: unknown): boolean {
  return typeof value === 'object' && value !== null
}

export function checkRollupEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value
  }
  if (typeof value !== 'object' || value === null) {
    return []
  }
  const raw = value as Record<string, unknown>
  const nodes = (raw.contexts as { nodes?: unknown } | undefined)?.nodes
  return Array.isArray(nodes) ? nodes : []
}

export function deriveWorkItemCheckSummary(value: unknown): GitHubWorkItem['checksSummary'] {
  const entries = checkRollupEntries(value)
  if (entries.length === 0) {
    return { state: 'none', total: 0, passed: 0, failed: 0, pending: 0 }
  }
  let passed = 0
  let failed = 0
  let pending = 0
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null) {
      pending += 1
      continue
    }
    const raw = entry as Record<string, unknown>
    const conclusion = String(raw.conclusion ?? raw.state ?? '').toUpperCase()
    const status = String(raw.status ?? '').toUpperCase()
    if (['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(conclusion)) {
      passed += 1
    } else if (
      ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(
        conclusion
      )
    ) {
      failed += 1
    } else if (status === 'COMPLETED' && conclusion) {
      failed += 1
    } else {
      pending += 1
    }
  }
  return {
    state: failed > 0 ? 'failure' : pending > 0 ? 'pending' : 'success',
    total: entries.length,
    passed,
    failed,
    pending
  }
}

export function mapPullRequestWorkItem(
  item: Record<string, unknown>,
  baseOwnerRepo: OwnerRepo | null = null
): MainWorkItem {
  // Why: fork PRs are disabled in the Start-from picker. We compare the PR head's
  // owner to the selected repo's owner; when the base repo is unknown we default
  // to false so non-picker call sites see the same shape as before.
  const headOwnerLogin = extractHeadOwnerLogin(item)
  // Why: only emit isCrossRepository when we actually know the head owner. If
  // the gh response lacks `headRepositoryOwner` (older callers, tests without
  // that fixture, or gh not returning it), leave the field undefined instead
  // of falsely claiming "not a fork".
  const isCrossRepository =
    headOwnerLogin !== null && baseOwnerRepo !== null
      ? headOwnerLogin !== baseOwnerRepo.owner
      : null
  const state = String(item.state ?? '').toLowerCase()
  const additions = numberFromUnknown(item.additions)
  const deletions = numberFromUnknown(item.deletions)
  const changedFiles = numberFromUnknown(
    item.changedFiles ??
      item.changed_files ??
      (item.files as { totalCount?: unknown } | undefined)?.totalCount
  )
  const mergeable = normalizePRMergeable(item.mergeable)
  const headSha =
    typeof item.headRefOid === 'string'
      ? item.headRefOid
      : typeof item.head === 'object' && item.head !== null
        ? typeof (item.head as { sha?: unknown }).sha === 'string'
          ? (item.head as { sha: string }).sha
          : undefined
        : undefined
  return {
    id: `pr:${String(item.number)}`,
    type: 'pr',
    number: Number(item.number),
    title: String(item.title ?? ''),
    state:
      state === 'merged' || item.merged_at || item.mergedAt
        ? 'merged'
        : state === 'closed'
          ? 'closed'
          : item.isDraft || item.draft
            ? 'draft'
            : 'open',
    url: String(item.html_url ?? item.url ?? ''),
    labels: Array.isArray(item.labels)
      ? item.labels
          .map((label) =>
            typeof label === 'object' && label !== null && 'name' in label
              ? String((label as { name?: unknown }).name ?? '')
              : ''
          )
          .filter(Boolean)
      : [],
    updatedAt: String(item.updated_at ?? item.updatedAt ?? ''),
    ...authorFieldsFromUnknown(item),
    branchName:
      typeof item.head === 'object' && item.head !== null && 'ref' in item.head
        ? String((item.head as { ref?: unknown }).ref ?? '')
        : String(item.headRefName ?? ''),
    baseRefName:
      typeof item.base === 'object' && item.base !== null && 'ref' in item.base
        ? String((item.base as { ref?: unknown }).ref ?? '')
        : String(item.baseRefName ?? ''),
    ...(headSha ? { headSha } : {}),
    ...(baseOwnerRepo ? { prRepo: { owner: baseOwnerRepo.owner, repo: baseOwnerRepo.repo } } : {}),
    ...(additions !== undefined ? { additions } : {}),
    ...(deletions !== undefined ? { deletions } : {}),
    ...(changedFiles !== undefined ? { changedFiles } : {}),
    ...('reviewDecision' in item
      ? { reviewDecision: normalizeReviewDecision(item.reviewDecision) }
      : {}),
    ...(item.reviewRequests !== undefined || item.requested_reviewers !== undefined
      ? { reviewRequests: usersFromUnknown(item.reviewRequests ?? item.requested_reviewers) }
      : {}),
    ...(item.latestReviews !== undefined
      ? { latestReviews: latestReviewsFromUnknown(item.latestReviews) }
      : {}),
    ...(item.assignees !== undefined ? { assignees: usersFromUnknown(item.assignees) } : {}),
    ...(item.statusCheckRollup !== undefined
      ? { checksSummary: deriveWorkItemCheckSummary(item.statusCheckRollup) }
      : {}),
    ...(mergeable ? { mergeable } : {}),
    ...('autoMergeRequest' in item
      ? { autoMergeEnabled: isAutoMergeEnabled(item.autoMergeRequest) }
      : {}),
    ...('mergeStateStatus' in item
      ? {
          mergeStateStatus: typeof item.mergeStateStatus === 'string' ? item.mergeStateStatus : null
        }
      : {}),
    ...(typeof item.maintainerCanModify === 'boolean'
      ? { maintainerCanModify: item.maintainerCanModify }
      : {}),
    ...(isCrossRepository !== null ? { isCrossRepository } : {})
  }
}
