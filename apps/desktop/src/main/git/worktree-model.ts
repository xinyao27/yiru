import type {
  GitWorktreeInfo,
  LocalBaseRefRefreshResult,
  LocalBaseRefUpdateSuggestion
} from '~shared/types'

export type AddWorktreeResult = {
  localBaseRefRefresh?: LocalBaseRefRefreshResult
  localBaseRefUpdateSuggestion?: LocalBaseRefUpdateSuggestion
}

export type GitWorktreeExecOptions = {
  wslDistro?: string
  signal?: AbortSignal
  timeout?: number
}

export type AddWorktreeOptions = GitWorktreeExecOptions & {
  checkoutExistingBranch?: boolean
  suggestLocalBaseRefUpdate?: boolean
  remoteTrackingBase?: {
    base: string
    branch: string
    ref: string
  }
}

export type RemoveWorktreeOptions = GitWorktreeExecOptions & {
  deleteBranch?: boolean
  forceBranchDelete?: boolean
  knownRemovedWorktree?: Pick<GitWorktreeInfo, 'branch' | 'head' | 'locked' | 'lockReason'>
}

export const WORKTREE_ADD_TIMEOUT_MS = 180_000
export const WORKTREE_REMOVAL_PREFLIGHT_TIMEOUT_MS = 30_000
