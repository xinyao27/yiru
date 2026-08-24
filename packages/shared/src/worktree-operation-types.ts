import type { SleepingAgentLaunchConfig } from '@yiru/workbench-model/agent'
import type * as WorkbenchWorkspaceTypes from '@yiru/workbench-model/workspace'

import type { StartupCommandDelivery } from './codex-startup-delivery'
import type { TuiAgent } from './settings-foundation-types'
import type { AgentKind, LaunchSource, RequestKind } from './telemetry-events'
import type {
  GitPushTarget,
  GitWorktreeInfo,
  HookCommandSourcePolicy,
  SetupAgentStartupPolicy,
  SetupDecision,
  SetupRunPolicy,
  WorkspaceKey,
  WorkspaceLineage,
  WorkspaceStatus,
  Worktree,
  WorktreeLineage,
  WorktreeLineageWarning
} from './types'
import type { WorkspaceSource } from './workspace/source'

export type YiruHooks = {
  scripts: {
    setup?: string // Runs after worktree is created
    archive?: string // Runs before worktree is archived
  }
  defaultTabs?: YiruDefaultTabTemplate[] // Terminal tabs to create once for a new worktree
  worktree?: {
    sharedDirectories: string[]
  }
}

export type YiruDefaultTabTemplate = {
  title?: string
  color?: string
  command?: string
}

export type RepoHookSettings = {
  // Why: persisted data may still include the old mode field from the earlier
  // hook UI. Keep it in the shape so existing local state reads without a migration.
  mode: 'auto' | 'override'
  setupRunPolicy?: SetupRunPolicy
  setupAgentStartupPolicy?: SetupAgentStartupPolicy
  commandSourcePolicy?: HookCommandSourcePolicy
  scripts: {
    setup: string
    archive: string
  }
}

export type WorktreeSetupLaunch = {
  runnerScriptPath: string
  envVars: Record<string, string>
  command?: string
  waitForAgentStartup?: boolean
}

export type WorktreeStartupLaunch = {
  command: string
  env?: Record<string, string>
  launchConfig?: SleepingAgentLaunchConfig
  launchToken?: string
  launchAgent?: TuiAgent
  startupCommandDelivery?: StartupCommandDelivery
  telemetry?: { agent_kind: AgentKind; launch_source: LaunchSource; request_kind: RequestKind }
}

export type WorktreeDefaultTabsLaunch = {
  tabs: YiruDefaultTabTemplate[]
  runCommands: boolean
}

export type WorktreeCreateTimingPhase = {
  phase: string
  startedAtMs: number
  durationMs: number
}

export type WorktreeCreateTiming = {
  totalDurationMs: number
  phases: WorktreeCreateTimingPhase[]
}

export type CreateSparseCheckoutRequest = WorkbenchWorkspaceTypes.CreateSparseCheckoutRequest

/** A reusable per-repo sparse directory list. Saved by the user from the
 *  composer; surfaced again the next time they create a worktree in the same
 *  repo. The MVP scope (no preset) is `presetId === undefined`. */
export type SparsePreset = {
  id: string
  repoId: string
  name: string
  directories: string[]
  createdAt: number
  updatedAt: number
}

export type CreateWorktreeArgs = {
  repoId: string
  name: string
  /** Optional user-facing label to persist separately from the git-safe branch/path seed. */
  displayName?: string
  baseBranch?: string
  /** Source Control compare target when it differs from the checkout start point. */
  compareBaseRef?: string
  /** Optional git branch to create, separate from the filesystem-safe worktree
   *  name. Used when creating from an existing branch whose local branch name
   *  legitimately contains `/` while the worktree directory must not. */
  branchNameOverride?: string
  setupDecision?: SetupDecision
  sparseCheckout?: CreateSparseCheckoutRequest
  linkedPR?: number
  linkedGitLabMR?: number
  linkedBitbucketPR?: number | null
  linkedAzureDevOpsPR?: number | null
  linkedGiteaPR?: number | null
  pushTarget?: GitPushTarget
  workspaceStatus?: WorkspaceStatus
  manualOrder?: number
  /** Parent workspace for in-app creates launched from a folder workspace. */
  parentWorkspace?: WorkspaceKey
  /** Agent selected in the create surface. Omitted for blank-shell creates. */
  createdWithAgent?: TuiAgent
  /** Set when the renderer knows this auto-generated branch should be renamed
   *  from the first agent message. */
  pendingFirstAgentMessageRename?: boolean
  /** Telemetry-only: which UI surface initiated this create. Threaded from
   *  the renderer entry point so main can emit `workspace_created` with the
   *  correct `source`. `unknown` is a valid wire value — an unrecognized
   *  surface emits `source: 'unknown'` rather than dropping the event, so
   *  dashboards surface enum-coverage gaps as a slice rather than as
   *  missing data. Optional on the type so older renderer code paths that
   *  pre-date this prop default to `unknown` at the IPC boundary instead
   *  of failing typecheck. */
  telemetrySource?: WorkspaceSource
  /** Optional startup command for callers that want the backend to spawn the
   *  first terminal as soon as the worktree is registered. */
  startup?: WorktreeStartupLaunch
  /** Correlates `createWorktree:progress` events back to a specific pending
   *  creation in the renderer, so concurrent background creates each drive
   *  their own status surface. Omitted by synchronous callers. */
  creationId?: string
}

export type CreateWorktreeResult = {
  worktree: Worktree & {
    parentWorktreeId?: string | null
    childWorktreeIds?: string[]
    lineage?: WorktreeLineage | null
    workspaceLineage?: WorkspaceLineage | null
    git?: GitWorktreeInfo
  }
  lineage?: WorktreeLineage | null
  workspaceLineage?: WorkspaceLineage | null
  warnings?: WorktreeLineageWarning[]
  setup?: WorktreeSetupLaunch
  setupReceipt?: {
    requested: 'run' | 'skip' | 'inherit'
    hookFound: boolean
    startupPolicy: 'wait-for-setup' | 'start-immediately'
    state: 'not_configured' | 'skipped' | 'running' | 'spawn_failed'
    terminalHandle?: string
  }
  defaultTabs?: WorktreeDefaultTabsLaunch
  warning?: string
  initialBaseStatus?: WorktreeBaseStatusEvent
  localBaseRefRefresh?: LocalBaseRefRefreshResult
  localBaseRefUpdateSuggestion?: LocalBaseRefUpdateSuggestion
  startupTerminal?: {
    spawned: boolean
    handle?: string
    tabId?: string
    paneKey?: string | null
    ptyId?: string | null
    surface?: 'visible' | 'background'
  }
  timing?: WorktreeCreateTiming
}

export type PreservedWorktreeBranch = {
  branchName: string
  head?: string
}

export type RemoveWorktreeResult = {
  preservedBranch?: PreservedWorktreeBranch
}

export type ForceDeleteWorktreeBranchResult = {
  deleted: true
}

export type LocalBaseRefRefreshResult = {
  status: 'updated' | 'skipped_dirty_worktree' | 'skipped_not_fast_forward' | 'skipped_error'
  baseRef: string
  localBranch: string
  ownerWorktreePath?: string
}

export type LocalBaseRefUpdateSuggestion = {
  baseRef: string
  localBranch: string
  behind: number
}

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

// ─── Updater ─────────────────────────────────────────────────────────

// Why: the release object sent to the renderer omits `version` (redundant
// with the top-level UpdateStatus.version) to keep one source of truth.
