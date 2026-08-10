export type RuntimeWorkspaceSpaceScanStatus =
  | 'ok'
  | 'missing'
  | 'permission-denied'
  | 'unavailable'
  | 'error'

export type RuntimeWorkspaceSpaceItemKind = 'directory' | 'file' | 'symlink' | 'other'

export type RuntimeWorkspaceSpaceItem = {
  name: string
  path: string
  kind: RuntimeWorkspaceSpaceItemKind
  sizeBytes: number
}

export type RuntimeWorkspaceSpaceWorktree = {
  worktreeId: string
  repoId: string
  repoDisplayName: string
  repoPath: string
  displayName: string
  path: string
  branch: string
  isMainWorktree: boolean
  isRemote: boolean
  isSparse: boolean
  canDelete: boolean
  lastActivityAt: number
  status: RuntimeWorkspaceSpaceScanStatus
  error: string | null
  scannedAt: number
  sizeBytes: number
  reclaimableBytes: number
  skippedEntryCount: number
  topLevelItems: RuntimeWorkspaceSpaceItem[]
  omittedTopLevelItemCount: number
  omittedTopLevelSizeBytes: number
}

export type RuntimeWorkspaceSpaceRepoSummary = {
  repoId: string
  displayName: string
  path: string
  isRemote: boolean
  worktreeCount: number
  scannedWorktreeCount: number
  unavailableWorktreeCount: number
  totalSizeBytes: number
  reclaimableBytes: number
  error: string | null
}

export type RuntimeWorkspaceSpaceAnalysis = {
  scannedAt: number
  totalSizeBytes: number
  reclaimableBytes: number
  worktreeCount: number
  scannedWorktreeCount: number
  unavailableWorktreeCount: number
  repos: RuntimeWorkspaceSpaceRepoSummary[]
  worktrees: RuntimeWorkspaceSpaceWorktree[]
}

export type RuntimeWorkspaceSpaceAnalyzeResult =
  | { ok: true; analysis: RuntimeWorkspaceSpaceAnalysis }
  | { ok: false; cancelled: true }

export type RuntimeWorkspaceSpaceScanProgress = {
  scanId: string
  state: 'running' | 'cancelling'
  startedAt: number
  updatedAt: number
  totalRepoCount: number
  scannedRepoCount: number
  totalWorktreeCount: number
  scannedWorktreeCount: number
  currentRepoDisplayName: string | null
  currentWorktreeDisplayName: string | null
}

export type RuntimeWorkspaceSpaceCancelResult = { cancelled: boolean }

export type RuntimeWorkspaceSpaceScanProgressEvent = {
  type: 'workspaceSpaceScanProgress'
  progress: RuntimeWorkspaceSpaceScanProgress
}

// Why: the scan is one host-wide singleton (duplicate calls join the same
// IO), so its progress is broadcast the same way — no scanId filter is
// required client-side, unlike `workspaceCleanup.events.subscribe`.
export type RuntimeWorkspaceSpaceEventsSubscriptionEvent =
  | { type: 'ready'; subscriptionId: string }
  | RuntimeWorkspaceSpaceScanProgressEvent
  | { type: 'end' }
