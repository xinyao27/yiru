import type { AddWorktreeResult } from '~main/git/worktree'
import type { LocalProjectWorktreeGitOptions } from '~main/project-runtime-git-options'
import type {
  CreateWorktreeResult,
  GitPushTarget,
  Repo,
  TuiAgent,
  Worktree,
  WorktreeLineage,
  WorktreeLineageWarning,
  WorkspaceCreateTelemetrySource,
  WorkspaceLineage,
  WorktreeStartupLaunch
} from '~shared/types'
import type { GitWorktreeInfo } from '~shared/worktree-types'

import type { RemoteTrackingBase, RuntimeStore } from './runtime-store'
import type { WorktreeStartupDraftPaste, WorktreeStartupFollowup } from './terminal-startup'
import type { WorktreeLineageInput, WorktreeLineageResolution } from './worktree-resolution'

export type ManagedWorktreeCreateArgs = {
  repoSelector: string
  name: string
  baseBranch?: string
  compareBaseRef?: string
  branchNameOverride?: string
  linkedPR?: number | null
  linkedGitLabMR?: number | null
  linkedBitbucketPR?: number | null
  linkedAzureDevOpsPR?: number | null
  linkedGiteaPR?: number | null
  comment?: string
  displayName?: string
  telemetrySource?: WorkspaceCreateTelemetrySource
  workspaceStatus?: string
  manualOrder?: number
  sparseCheckout?: { directories: string[]; presetId?: string }
  pushTarget?: GitPushTarget
  runHooks?: boolean
  activate?: boolean
  setupDecision?: 'run' | 'skip' | 'inherit'
  awaitTerminalProvisioning?: boolean
  observeSetupCompletion?: boolean
  createdWithAgent?: TuiAgent
  startupAgent?: TuiAgent
  startupPrompt?: string
  pendingFirstAgentMessageRename?: boolean
  startup?: WorktreeStartupLaunch
  startupDraft?: string
  startupDraftPaste?: WorktreeStartupDraftPaste
  lineage?: WorktreeLineageInput
}

export type ManagedWorktreeStartupContext = {
  args: ManagedWorktreeCreateArgs
  repo: Repo
  settings: ReturnType<RuntimeStore['getSettings']>
  effectiveStartup: WorktreeStartupLaunch | undefined
  effectiveStartupFollowup: WorktreeStartupFollowup | undefined
  effectiveCreatedWithAgent: TuiAgent | undefined
  effectiveDraftPaste: WorktreeStartupDraftPaste | undefined
}

export type ManagedWorktreeBranchContext = ManagedWorktreeStartupContext & {
  lineageInput: WorktreeLineageInput | undefined
  lineageResolution: WorktreeLineageResolution
  localWorktreeGitOptions: LocalProjectWorktreeGitOptions
  baseBranch: string
  branchName: string
  checkoutExistingBranch: boolean
  worktreePath: string
  effectiveRequestedName: string
  effectiveSanitizedName: string
  requestedDisplayName: string | undefined
}

export type ManagedWorktreeMaterializedContext = ManagedWorktreeBranchContext & {
  remoteTrackingBase: RemoteTrackingBase | null
  sparseDirectories: string[]
  addResult: AddWorktreeResult
  created: GitWorktreeInfo
  configuredPushTarget: GitPushTarget | undefined
}

export type ManagedWorktreePreparedContext = ManagedWorktreeMaterializedContext & {
  worktree: Worktree
  lineage: WorktreeLineage | null
  workspaceLineage: WorkspaceLineage | null
  lineageWarnings: WorktreeLineageWarning[]
  setup: CreateWorktreeResult['setup']
  defaultTabs: CreateWorktreeResult['defaultTabs']
  effectiveDecision: 'run' | 'skip' | 'inherit'
  hasSetupHook: boolean
  shouldRunSetup: boolean
  warning: string | undefined
}
