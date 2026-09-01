import type { RuntimeWorktreeAgentRow } from '../mobile-runtime-types.js'
import type { TuiAgent } from '../model/agent.js'
import type {
  DiffComment,
  ExecutionHostId,
  GitHubPrStartPoint,
  GitPushTarget,
  MobileDiffReviewState,
  WorkspaceStatus
} from '../model/workspace.js'

export type RuntimeGitWorktreeInfo = {
  path: string
  head: string
  branch: string
  isBare: boolean
  isSparse?: boolean
  locked?: boolean
  lockReason?: string
  prunable?: boolean
  prunableReason?: string
  isMainWorktree: boolean
}

export type RuntimeWorktree = RuntimeGitWorktreeInfo & {
  id: string
  instanceId?: string
  repoId: string
  projectId?: string
  hostId?: ExecutionHostId
  projectHostSetupId?: string
  displayName: string
  comment: string
  linkedPR: number | null
  linkedGitLabMR?: number | null
  linkedBitbucketPR?: number | null
  linkedAzureDevOpsPR?: number | null
  linkedGiteaPR?: number | null
  isArchived: boolean
  isUnread: boolean
  isPinned: boolean
  sortOrder: number
  manualOrder?: number
  lastActivityAt: number
  createdAt?: number
  createdWithAgent?: TuiAgent
  pendingFirstAgentMessageRename?: boolean
  firstAgentMessageRenameError?: string | null
  sparseDirectories?: string[]
  sparseBaseRef?: string
  sparsePresetId?: string
  baseRef?: string
  pushTarget?: GitPushTarget
  priorWorktreeIds?: string[]
  workspaceStatus?: WorkspaceStatus
  diffComments?: DiffComment[]
  mobileDiffReview?: MobileDiffReviewState
}

export type RuntimeWorktreeLineageCapture = {
  source:
    | 'explicit-cli-flag'
    | 'env-workspace'
    | 'cwd-context'
    | 'terminal-context'
    | 'orchestration-context'
    | 'active-workspace'
    | 'manual-action'
  confidence: 'explicit' | 'inferred'
}

export type RuntimeWorktreeLineage = {
  worktreeId: string
  worktreeInstanceId: string
  parentWorktreeId: string
  parentWorktreeInstanceId: string
  origin: 'orchestration' | 'cli' | 'manual'
  capture: RuntimeWorktreeLineageCapture
  orchestrationRunId?: string
  taskId?: string
  coordinatorHandle?: string
  createdByTerminalHandle?: string
  createdAt: number
}

export type RuntimeWorkspaceKey = `worktree:${string}` | `folder:${string}`

export type RuntimeWorkspaceLineage = {
  childWorkspaceKey: RuntimeWorkspaceKey
  childInstanceId?: string | null
  parentWorkspaceKey: RuntimeWorkspaceKey
  parentInstanceId?: string | null
  origin: 'orchestration' | 'cli' | 'manual'
  capture: RuntimeWorktreeLineageCapture
  taskId?: string
  orchestrationRunId?: string
  coordinatorHandle?: string
  createdByTerminalHandle?: string
  createdAt: number
}

export type RuntimeWorktreeRecord = RuntimeWorktree & {
  parentWorktreeId: string | null
  childWorktreeIds: string[]
  lineage: RuntimeWorktreeLineage | null
  workspaceLineage?: RuntimeWorkspaceLineage | null
  git: RuntimeGitWorktreeInfo
}

export type RuntimeDetectedWorktree = RuntimeWorktree & {
  ownership: 'yiru-managed' | 'external' | 'unknown-legacy'
  selectedCheckout: boolean
  visible: boolean
}

export type RuntimeDetectedWorktreeListResult = {
  revision?: number
  repoId: string
  authoritative: boolean
  source: 'git' | 'metadata-fallback' | 'session-fallback'
  worktrees: RuntimeDetectedWorktree[]
}

export type RuntimeWorktreePsSummary = {
  workspaceKind?: 'git' | 'folder-workspace'
  worktreeId: string
  repoId: string
  hostId?: ExecutionHostId
  resumeTargetStatus?: 'local' | 'runtime' | 'unknown'
  terminalPlatform?: NodeJS.Platform
  priorWorktreeIds?: string[]
  repo: string
  path: string
  branch: string
  isArchived: boolean
  isMainWorktree: boolean
  hasHostSidebarActivity: boolean
  worktreeInstanceId?: string
  lineageWorktreeInstanceId?: string
  parentWorktreeInstanceId?: string
  parentWorktreeId: string | null
  childWorktreeIds: string[]
  displayName: string
  workspaceStatus: string
  sortOrder: number
  manualOrder?: number
  lastActivityAt?: number
  createdAt?: number
  linkedPR: { number: number; state: string } | null
  linkedGitLabMR: number | null
  comment: string
  isPinned: boolean
  isActive: boolean
  unread: boolean
  liveTerminalCount: number
  hasAttachedPty: boolean
  lastOutputAt: number | null
  preview: string
  status: 'active' | 'working' | 'permission' | 'done' | 'inactive'
  agents: RuntimeWorktreeAgentRow[]
}

export type RuntimeWorktreeListResult = {
  worktrees: RuntimeWorktreeRecord[]
  totalCount: number
  truncated: boolean
}

export type RuntimeWorktreePsResult = {
  worktrees: RuntimeWorktreePsSummary[]
  totalCount: number
  truncated: boolean
}

export type RuntimeWorktreeCreateResult = {
  revision?: number
  worktree: RuntimeWorktree & {
    parentWorktreeId?: string | null
    childWorktreeIds?: string[]
    lineage?: RuntimeWorktreeLineage | null
    workspaceLineage?: RuntimeWorkspaceLineage | null
    git?: RuntimeGitWorktreeInfo
  }
  lineage?: RuntimeWorktreeLineage | null
  workspaceLineage?: RuntimeWorkspaceLineage | null
  warnings?: {
    code:
      | 'LINEAGE_PARENT_CONTEXT_MISSING'
      | 'LINEAGE_PARENT_CONTEXT_CONFLICT'
      | 'LINEAGE_PARENT_INSTANCE_STALE'
    message: string
    details?: Record<string, unknown>
  }[]
  setup?: {
    runnerScriptPath: string
    envVars: Record<string, string>
    command?: string
    waitForAgentStartup?: boolean
  }
  setupReceipt?: {
    requested: 'run' | 'skip' | 'inherit'
    hookFound: boolean
    startupPolicy: 'wait-for-setup' | 'start-immediately'
    state: 'not_configured' | 'skipped' | 'running' | 'spawn_failed'
    terminalHandle?: string
  }
  defaultTabs?: {
    tabs: { title?: string; color?: string; command?: string }[]
    runCommands: boolean
  }
  warning?: string
  initialBaseStatus?: {
    repoId: string
    worktreeId: string
    status: 'checking' | 'current' | 'drift' | 'base_changed' | 'unknown'
    base: string
    remote?: string
    behind?: number
    recentSubjects?: string[]
  }
  localBaseRefRefresh?: {
    status: 'updated' | 'skipped_dirty_worktree' | 'skipped_not_fast_forward' | 'skipped_error'
    baseRef: string
    localBranch: string
    ownerWorktreePath?: string
  }
  localBaseRefUpdateSuggestion?: { baseRef: string; localBranch: string; behind: number }
  startupTerminal?: {
    spawned: boolean
    handle?: string
    tabId?: string
    paneKey?: string | null
    ptyId?: string | null
    surface?: 'visible' | 'background'
  }
  timing?: {
    totalDurationMs: number
    phases: { phase: string; startedAtMs: number; durationMs: number }[]
  }
  agentTerminalHandle?: string
}

export type RuntimeWorktreeShowResult = { revision?: number; worktree: RuntimeWorktreeRecord }
export type RuntimeWorktreeLineageListResult = {
  lineage: Record<string, RuntimeWorktreeLineage>
  workspaceLineage: Record<RuntimeWorkspaceKey, RuntimeWorkspaceLineage>
}
export type RuntimeWorktreeSleepResult = { worktreeId: string }
export type RuntimeWorktreeActivateResult = {
  repoId: string
  worktreeId: string
  activated: boolean
  sleepingAgentWake: 'requested' | 'unsupported-headless' | 'not-applicable'
}
export type RuntimeWorktreeRemoveResult = {
  revision?: number
  removed: boolean
  preservedBranch?: { branchName: string; head?: string }
  warning?: string
}
export type RuntimeWorktreeMrBaseResult =
  | { baseBranch: string; compareBaseRef?: string; pushTarget?: GitPushTarget }
  | { error: string }
export type RuntimeWorktreePrBaseResult = GitHubPrStartPoint | { error: string }
export type RuntimeWorktreePrefetchResult = null
export type RuntimeWorktreePersistSortOrderResult = { updated: number }
export type RuntimeWorktreeForceDeleteBranchResult = { deleted: true }

// Worktree state signals the shell receives over IPC. Paired clients render the
// same base-drift banner and remote-branch conflict prompt, so they need the
// same events. HEAD identity refreshes are deliberately absent: their watcher
// short-circuits on `mainWindow.isDestroyed()`, so it never runs headless — a
// variant here would be a contract promise nothing can keep until that watcher
// is decoupled from the window.
export type WorktreeBaseStatusKind = 'checking' | 'current' | 'drift' | 'base_changed' | 'unknown'

export type WorktreeBaseStatusEvent = {
  repoId: string
  worktreeId: string
  status: WorktreeBaseStatusKind
  base: string
  /** Configured remote name parsed from `base` (longest-prefix match). Absent
   *  when classification skipped optimistic reconcile (e.g. legacy fallback). */
  remote?: string
  behind?: number
  recentSubjects?: string[]
}

export type WorktreeRemoteBranchConflictEvent = {
  repoId: string
  worktreeId: string
  remote: string
  branchName: string
}

export type RuntimeWorktreeStateEvent =
  | ({ type: 'baseStatus' } & WorktreeBaseStatusEvent)
  | ({ type: 'remoteBranchConflict' } & WorktreeRemoteBranchConflictEvent)

export type RuntimeWorktreeStateSubscriptionEvent =
  | { type: 'ready'; subscriptionId: string }
  | RuntimeWorktreeStateEvent
  | { type: 'end' }
