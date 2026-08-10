import type { CoworkingAgentLaunchId } from './coworking-input.js'
import type { RuntimeDetectedWorktreeListResult } from './worktree-types.js'

export type RuntimeCoworkingErrorCode =
  | 'invalid_argument'
  | 'method_not_found'
  | 'outcome_unknown'
  | 'resource_busy'
  | 'resource_not_found'
  | 'resource_unavailable'
  | 'result_too_large'
  | 'unauthorized'
  | 'internal_error'

export type RuntimeCoworkingCanonicalPath = {
  scopeKey: string
  rootKey: string
  ancestorKeys: string[]
}

export type RuntimeCoworkingWorktreeCatalog = {
  actualHostScope: string
  inventory: RuntimeDetectedWorktreeListResult
}

export type RuntimeCoworkingInspection =
  | {
      status: 'resolved'
      root: RuntimeCoworkingCanonicalPath
      markerId: string | null
      actualHostScope: string
    }
  | {
      status: 'unavailable'
      reason:
        | 'ambiguous-root'
        | 'host-unavailable'
        | 'invalid-host-response'
        | 'marker-unavailable'
        | 'not-git-worktree'
      actualHostScope?: string
    }

export type RuntimeCoworkingCanonicalizeResult =
  | { status: 'resolved'; path: RuntimeCoworkingCanonicalPath }
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'unavailable' }

export type RuntimeCoworkingFileTreeEntry = {
  relativePath: string
  name: string
  kind: 'file' | 'directory' | 'symlink'
  size: number | null
  modifiedAt: number | null
}

export type RuntimeCoworkingFileListResult = {
  relativePath: string
  entries: readonly RuntimeCoworkingFileTreeEntry[]
  truncated: boolean
}

export type RuntimeCoworkingFileReadResult = {
  relativePath: string
  encoding: 'utf8' | 'base64'
  content: string
  offset: number
  bytesRead: number
  totalBytes: number
  truncated: boolean
}

export type RuntimeCoworkingFileDiffResult = {
  relativePath: string
  staged: boolean
  patch: string
  truncated: boolean
}

export type RuntimeCoworkingGitStatusEntry = {
  relativePath: string
  oldRelativePath?: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'copied'
  area: 'staged' | 'unstaged' | 'untracked'
  conflicted?: boolean
}

export type RuntimeCoworkingGitStatusResult = {
  branch: string | null
  upstream: { name: string; ahead: number; behind: number } | null
  entries: readonly RuntimeCoworkingGitStatusEntry[]
  truncated: boolean
}

export type RuntimeCoworkingGitDiffResult = {
  source: 'working-tree' | 'index' | 'commit'
  relativePath: string | null
  patch: string
  truncated: boolean
}

export type RuntimeCoworkingGitHistoryEntry = {
  commitRef: string
  parentRefs: readonly string[]
  subject: string
  message: string
  author: string | null
  committedAt: number | null
}

export type RuntimeCoworkingGitHistoryResult = {
  entries: readonly RuntimeCoworkingGitHistoryEntry[]
  hasMore: boolean
}

export type RuntimeCoworkingChecksReview = {
  provider: 'github' | 'gitlab' | 'bitbucket' | 'azure-devops' | 'gitea' | 'unsupported'
  number: number
  title: string
  state: 'open' | 'closed' | 'merged' | 'draft'
  url: string | null
  status: 'pending' | 'success' | 'failure' | 'neutral'
  updatedAt: string
  mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN'
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null
}

export type RuntimeCoworkingCheckEntry = {
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
    | 'action_required'
    | null
  url: string | null
}

export type RuntimeCoworkingChecksReadResult = {
  review: RuntimeCoworkingChecksReview | null
  checks: readonly RuntimeCoworkingCheckEntry[]
  truncated: boolean
  detailStatus: 'complete' | 'unavailable' | 'unsupported'
}

export type RuntimeCoworkingMutationResult = { ok: true }

export type RuntimeCoworkingTerminalLaunchOptionsResult = {
  agents: readonly CoworkingAgentLaunchId[]
  defaultAgent: CoworkingAgentLaunchId | null
}

export type RuntimeCoworkingTerminalCreateResult = {
  terminalHandle: string
  sessionKey: string
  provider: 'claude' | 'codex' | 'other'
  title: string
}

export type RuntimeCoworkingExecutionResult =
  | RuntimeCoworkingFileListResult
  | RuntimeCoworkingFileReadResult
  | RuntimeCoworkingFileDiffResult
  | RuntimeCoworkingGitStatusResult
  | RuntimeCoworkingGitDiffResult
  | RuntimeCoworkingGitHistoryResult
  | RuntimeCoworkingChecksReadResult
  | RuntimeCoworkingMutationResult
  | RuntimeCoworkingTerminalLaunchOptionsResult
  | RuntimeCoworkingTerminalCreateResult

export type RuntimeCoworkingInvokeResponse =
  | { status: 'ok'; result: RuntimeCoworkingExecutionResult }
  | { status: 'error'; code: RuntimeCoworkingErrorCode }

export type RuntimeCoworkingMutationResponse = { ok: true }

export type RuntimeCoworkingTerminalEvent =
  | {
      kind: 'snapshot'
      data: string
      cols: number
      rows: number
      sequence: number
    }
  | { kind: 'output'; data: string; sequence: number }
  | { kind: 'resized'; cols: number; rows: number; sequence: number }
  | { kind: 'closed' }
