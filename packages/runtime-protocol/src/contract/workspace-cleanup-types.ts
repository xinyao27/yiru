export type RuntimeWorkspaceCleanupTier = 'ready' | 'review' | 'protected'

export type RuntimeWorkspaceCleanupReason = 'archived' | 'idle-clean'

export type RuntimeWorkspaceCleanupBlocker =
  | 'main-worktree'
  | 'folder-repo'
  | 'pinned'
  | 'active-workspace'
  | 'running-terminal'
  | 'terminal-liveness-unknown'
  | 'dirty-editor-buffer'
  | 'volatile-local-context'
  | 'recent-visible-context'
  | 'live-agent'
  | 'ssh-disconnected'
  | 'git-status-error'
  | 'dirty-files'
  | 'unpushed-commits'
  | 'unknown-base'
  | 'dismissed'

export type RuntimeWorkspaceCleanupDismissal = {
  worktreeId: string
  dismissedAt: number
  fingerprint: string
  classifierVersion: number
}

export type RuntimeWorkspaceCleanupCandidate = {
  worktreeId: string
  repoId: string
  repoName: string
  connectionId: string | null
  displayName: string
  branch: string
  path: string
  tier: RuntimeWorkspaceCleanupTier
  selectedByDefault: boolean
  reasons: RuntimeWorkspaceCleanupReason[]
  blockers: RuntimeWorkspaceCleanupBlocker[]
  lastActivityAt: number
  createdAt?: number
  localContext: {
    terminalTabCount: number
    cleanEditorTabCount: number
    browserTabCount: number
    diffCommentCount: number
    newestDiffCommentAt: number | null
    retainedDoneAgentCount: number
  }
  git: {
    clean: boolean | null
    upstreamAhead: number | null
    upstreamBehind: number | null
    checkedAt: number | null
  }
  fingerprint: string
}

export type RuntimeWorkspaceCleanupScanError = {
  repoId: string
  repoName: string
  message: string
}

export type RuntimeWorkspaceCleanupScanResult = {
  scannedAt: number
  candidates: RuntimeWorkspaceCleanupCandidate[]
  errors: RuntimeWorkspaceCleanupScanError[]
}

export type RuntimeWorkspaceCleanupScanProgress = RuntimeWorkspaceCleanupScanResult & {
  scanId: string
  scannedWorktreeCount: number
  totalWorktreeCount: number
  candidateMode?: 'append' | 'snapshot'
}

export type RuntimeWorkspaceCleanupDismissResult = {
  dismissals: Record<string, RuntimeWorkspaceCleanupDismissal>
}

export type RuntimeWorkspaceCleanupScanProgressEvent = {
  type: 'workspaceCleanupScanProgress'
  progress: RuntimeWorkspaceCleanupScanProgress
}

// Why: scan progress is per-scanId, not host-wide, but there is no narrower
// audience to scope the stream to than "this host" — the client filters
// ticks by the scanId it started, same shape as `projectGroup.events.subscribe`.
export type RuntimeWorkspaceCleanupEventsSubscriptionEvent =
  | { type: 'ready'; subscriptionId: string }
  | RuntimeWorkspaceCleanupScanProgressEvent
  | { type: 'end' }
