export type RepoKind = 'git' | 'folder'

export type SetupDecision = 'inherit' | 'run' | 'skip'

export type BaseRefSearchResult = {
  refName: string
  localBranchName: string
}

export type WorkspaceStatus = string

export type WorkspaceStatusDefinition = {
  id: WorkspaceStatus
  label: string
  color?: string
  icon?: string
}

export type GitPushTarget = {
  remoteName: string
  branchName: string
  remoteUrl?: string
  /** True when Yiru added this remote while preparing a fork-PR worktree. */
  remoteCreated?: boolean
}

export type GitHubPrStartPoint = {
  baseBranch: string
  /** Review target branch to use for Source Control compare after creating from a PR head SHA. */
  compareBaseRef?: string
  pushTarget?: GitPushTarget
  /** Verified PR head commit. Present when checkout can be tied to a stable SHA. */
  headSha?: string
  /** Exact local branch name to create/reuse when the PR head is a safe same-repo branch. */
  branchNameOverride?: string
  /** Fork PRs: false when "Allow edits from maintainers" is off; a push to the fork may be rejected. */
  maintainerCanModify?: boolean
}

export type DiffCommentSource = 'diff' | 'markdown'
export type DiffReviewScope = 'unstaged' | 'staged' | 'branch'

export type MobileDiffReviewFileState = {
  key: string
  filePath: string
  oldPath?: string
  scope: DiffReviewScope
  lastOpenedAt?: number
  lastSeenDiffIdentity?: string
  reviewedAt?: number
  reviewDiffIdentity?: string
}

export type MobileDiffReviewState = {
  version: 1
  updatedAt?: number
  completedAt?: number
  files: Record<string, MobileDiffReviewFileState>
}

export type DiffComment = {
  id: string
  worktreeId: string
  filePath: string
  /** Undefined means a legacy diff note. */
  source?: DiffCommentSource
  /** Exact text selected when creating a markdown note, when available. */
  selectedText?: string
  /** Inclusive range start. Must be <= lineNumber when present. */
  startLine?: number
  lineNumber: number
  body: string
  createdAt: number
  updatedAt?: number
  /** Set after the note has been handed to an agent. Edits clear it. */
  sentAt?: number
  scope?: DiffReviewScope
  oldPath?: string
  diffIdentity?: string
  // Reserved for future "comments on the original side" — always 'modified' in v1.
  side: 'modified'
}

export type CreateSparseCheckoutRequest = {
  directories: string[]
  /** Set when the directories came from a saved preset and the user did not
   *  modify them — recorded on WorktreeMeta so the worktree can show "from
   *  preset X" later. Cleared if the user edited the textarea. */
  presetId?: string
}

export type PersistedTrustedYiruHookEntry = {
  contentHash: string
  approvedAt: number
}

export type PersistedTrustedYiruHookRepo = {
  all?: {
    approvedAt: number
  }
  setup?: PersistedTrustedYiruHookEntry
  archive?: PersistedTrustedYiruHookEntry
  vmRecipe?: PersistedTrustedYiruHookEntry
}

export type PersistedTrustedYiruHooks = Record<string, PersistedTrustedYiruHookRepo>
