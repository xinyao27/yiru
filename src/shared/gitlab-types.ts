/* GitLab-specific shared types. Split out of `src/shared/types.ts` so
   adding or changing a GitLab type doesn't surface as a merge conflict
   on every upstream sync of the much larger central types file.
   Imports the small base types (CheckStatus, ClassifiedError,
   PRConflictSummary) it depends on; re-exported from `./types` for
   import-stability — existing call sites (`from '../shared/types'`)
   continue to work without changes. */
import type { CheckStatus, ClassifiedError, PRConflictSummary } from './types'

// Why: GitLab's analogue of `GitHubOwnerRepo`. Two structural differences
// from GitHub make the flat owner/repo shape inadequate: (a) projects can
// live under arbitrarily nested groups (`group/subgroup/project`), and
// (b) self-hosted instances live on hostnames other than gitlab.com so the
// host has to travel with the path for URL construction and glab host
// targeting. Aliased as `ProjectRef` in `src/main/gitlab/gl-utils.ts`.
export type GitLabProjectRef = { host: string; path: string }

// ── GitLab merge-request shapes ────────────────────────────────────
// Native GitLab state strings are preserved (`opened` vs GitHub's `open`)
// so every GitLab-side type consistently uses the API's own vocabulary.

export type MRState = 'opened' | 'closed' | 'merged' | 'locked' | 'draft'
// Why: glab does not surface a structured "mergeable" field equivalent to
// GitHub's GraphQL `mergeable`; we project the available signals
// (`detailed_merge_status`, `has_conflicts`) onto the same three-value
// shape used by GitHub's PRMergeableState so the UI can stay simple.
export type MRMergeableState = 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'

// Why: GitLab pipeline jobs and GitHub check-runs map onto the same
// three-state lifecycle. Keep the field names identical to PRCheckDetail
// so the rendering layer can share a row component.
export type MRCheckDetail = {
  name: string
  status: 'queued' | 'in_progress' | 'completed'
  conclusion:
    | 'success'
    | 'failure'
    | 'cancelled'
    | 'timed_out'
    | 'neutral'
    | 'skipped'
    | 'pending'
    | null
  url: string | null
}

export type MRInfo = {
  number: number
  title: string
  state: MRState
  url: string
  pipelineStatus: CheckStatus
  updatedAt: string
  mergeable: MRMergeableState
  /** Full markdown description as authored on the MR. Optional because
   *  list endpoints omit it; populated on single-MR fetch (`getMR`). */
  description?: string
  /** Author username (GitLab `username`). Optional for the same reason. */
  author?: string | null
  authorAvatarUrl?: string | null
  /** GitLab MR head SHA — pipeline status is keyed off the head commit. */
  headSha?: string
  /** Target branch name for review-created worktree compare-base repair. */
  baseRefName?: string
  conflictSummary?: PRConflictSummary
}

// Why: GitLab "emoji awards" are a richer set than GitHub's eight
// reactions; rather than enumerate all of them, carry the raw award name
// and let the renderer decide what to surface.
export type GitLabReaction = {
  name: string
  count: number
}

export type MRComment = {
  id: number
  author: string
  authorAvatarUrl: string
  body: string
  createdAt: string
  url: string
  reactions?: GitLabReaction[]
  /** File path for inline review comments (absent for top-level discussion notes). */
  path?: string
  /** GitLab discussion ID — present only for inline review comments. Used to
   *  resolve/unresolve the discussion via `glab api`. */
  threadId?: string
  /** Whether the discussion has been resolved. Only meaningful when threadId is set. */
  isResolved?: boolean
  line?: number
  startLine?: number
  /** True when GitLab identifies the author as a bot (user `state === 'bot'`
   *  or matching system user heuristics). Mirrors GitHub PRComment.isBot. */
  isBot?: boolean
}

export type GitLabCommentResult = { ok: true; comment: MRComment } | { ok: false; error: string }
export type GitLabDiscussionResolveResult = { ok: true } | { ok: false; error: string }

export type GitLabJobTraceResult = { ok: true; trace: string } | { ok: false; error: string }

export type GitLabRetryJobResult =
  | { ok: true; job?: GitLabPipelineJob }
  | { ok: false; error: string }

export type GitLabViewer = {
  username: string
  email: string | null
}

export type GitLabAuthDiagnostic = {
  glabAvailable: boolean
  authenticated: boolean
  hosts: string[]
  activeHost: string | null
  envTokenInProcess: 'GITLAB_TOKEN' | 'GLAB_TOKEN' | null
  error: string | null
}

export type GitLabRateLimitBucket = {
  limit: number
  remaining: number
  resetAt: number | null
}

export type GitLabRateLimitSnapshot = {
  rest: GitLabRateLimitBucket | null
  host: string | null
  fetchedAt: number
}

export type GetGitLabRateLimitResult =
  | { ok: true; snapshot: GitLabRateLimitSnapshot }
  | { ok: false; error: string }

export type GitLabAssignableUser = {
  id?: number
  username: string
  name: string | null
  avatarUrl: string
  state?: string | null
}

export type GitLabMRApprovalRule = {
  id: number
  name: string
  approvalsRequired: number
  approved: boolean
}

export type GitLabMRApprovalState = {
  approvalsRequired: number | null
  approvalsLeft: number | null
  approvedBy: GitLabAssignableUser[]
  rules: GitLabMRApprovalRule[]
}

export type GitLabMRReviewersUpdateResult =
  | { ok: true; reviewers: GitLabAssignableUser[] }
  | { ok: false; error: string }

export type GitLabWorkItem = {
  id: string
  type: 'mr'
  number: number
  title: string
  state: 'opened' | 'closed' | 'merged' | 'locked' | 'draft'
  url: string
  labels: string[]
  updatedAt: string
  author: string | null
  branchName?: string
  baseRefName?: string
  /** True when an MR's source branch lives in a fork project. The
   *  Start-from picker mirrors GitHub's behavior and disables fork MRs in
   *  v1 because resolving a fork head from the source branch alone is not
   *  safe. */
  isCrossRepository?: boolean
  /** Stamped by the renderer fetcher / optimistic stubs so cross-project
   *  views can attribute rows. Mirrors GitHubWorkItem.repoId. */
  repoId: string
  /** Exact GitLab project that produced this row. Mutations/details must use it
   *  instead of re-resolving the repo preference later. */
  projectRef?: GitLabProjectRef
}

export type GitLabMRFile = {
  path: string
  oldPath?: string
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged'
  additions: number
  deletions: number
  /** GitLab marks files above its diff size limit as binary; we skip content fetches for these. */
  isBinary: boolean
  diff?: string
}

export type GitLabMRInlineCommentInput = {
  body: string
  path: string
  oldPath?: string
  line: number
  baseSha: string
  startSha: string
  headSha: string
}

// Why: per-job pipeline status lets the review sidebar show which job
// failed and where without requiring the user to leave Yiru.
// Mirrors PRCheckDetail's "single row per check" shape so the rendering
// component is reusable.
export type GitLabPipelineJob = {
  id: number
  pipelineId?: number
  name: string
  /** GitLab stage name, e.g. 'build' / 'test' / 'deploy'. */
  stage: string
  /** Raw GitLab job status — 'success' / 'failed' / 'running' / 'pending'
   *  / 'canceled' / 'skipped' / 'manual' / 'created' / 'preparing'. The
   *  renderer maps to a colored pill via the existing status helpers. */
  status: string
  webUrl: string
  /** Duration in seconds. null when the job hasn't finished. */
  duration: number | null
}

// Why: the review sidebar needs one MR payload spanning the description,
// conversation, pipeline, reviewers, and approval state.
export type GitLabWorkItemDetails = {
  /** repoId is stamped by the renderer's composer caller; main-process results
   *  do not know Yiru's Repo.id. */
  item: Omit<GitLabWorkItem, 'repoId'>
  body: string
  comments: MRComment[]
  /** MR head/base SHAs. Reserved for a future Files tab. */
  headSha?: string
  baseSha?: string
  startSha?: string
  files?: GitLabMRFile[]
  /** Populated when the merge request's head_pipeline exists. */
  pipelineJobs?: GitLabPipelineJob[]
  reviewers?: GitLabAssignableUser[]
  approvalState?: GitLabMRApprovalState
  participants?: GitLabAssignableUser[]
}

export type GitLabMRUpdate = {
  title?: string
  body?: string
  addLabels?: string[]
  removeLabels?: string[]
}

// Why: GitLab-native MR list filter — Open / Merged / Closed / All —
// replaces GitHub's search-DSL on the GitLab tab per the agreed scope.
// 'all' maps to no state filter (any state).
export type MRListState = 'opened' | 'merged' | 'closed' | 'all'

// Why: paginated MR list results carry server pagination metadata.
// totalCount / totalPages come from X-Total / X-Total-Pages response
// headers via `glab api -i`, so the renderer can show "Page X of Y".
export type GitLabPagedResult<T> = {
  items: T[]
  page: number
  perPage: number
  totalCount: number
  totalPages: number
  error?: ClassifiedError
}

export type ListMergeRequestsResult = GitLabPagedResult<GitLabWorkItem>
