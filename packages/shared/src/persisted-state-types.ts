import type { MigrationUnsupportedPtyEntry } from '@yiru/workbench-model/agent'
import type { ExecutionHostId } from '@yiru/workbench-model/workspace'
import type * as WorkbenchWorkspaceTypes from '@yiru/workbench-model/workspace'

import type { FeatureInteractionTelemetryBucketState } from './feature-interactions'
import type { RateLimitResumeSchedule } from './rate-limit-resume/types'
import type {
  FolderWorkspace,
  GlobalSettings,
  OnboardingState,
  PersistedUIState,
  PRInfo,
  Project,
  ProjectGroup,
  ProjectHostSetup,
  Repo,
  SparsePreset,
  WorkspaceKey,
  WorkspaceLineage,
  WorkspaceSessionState,
  WorktreeLineage,
  WorktreeMeta
} from './types'

export type PersistedTrustedYiruHookEntry = WorkbenchWorkspaceTypes.PersistedTrustedYiruHookEntry
export type PersistedTrustedYiruHookRepo = WorkbenchWorkspaceTypes.PersistedTrustedYiruHookRepo
export type PersistedTrustedYiruHooks = WorkbenchWorkspaceTypes.PersistedTrustedYiruHooks

export type LegacyPaneKeyAliasEntry = {
  ptyId: string
  /** Physical pane key retained by the live process. Field name is persisted
   *  for compatibility; UUID keys are used after pane-to-tab detach. */
  legacyPaneKey: string
  /** Current logical owner pane key. May belong to another tab after detach. */
  stablePaneKey: string
  updatedAt: number
}

// ─── Persistence shape ──────────────────────────────────────────────
export type PersistedState = {
  schemaVersion: number
  repos: Repo[]
  projects: Project[]
  projectHostSetups: ProjectHostSetup[]
  projectGroups: ProjectGroup[]
  folderWorkspaces: FolderWorkspace[]
  /** Sparse-checkout presets keyed by repoId. Empty record on first launch;
   *  presets are managed from the new-workspace composer and repo settings. */
  sparsePresetsByRepo: Record<string, SparsePreset[]>
  worktreeMeta: Record<string, WorktreeMeta>
  worktreeLineageById: Record<string, WorktreeLineage>
  workspaceLineageByChildKey: Record<WorkspaceKey, WorkspaceLineage>
  settings: GlobalSettings
  ui: PersistedUIState
  githubCache: {
    pr: Record<string, { data: PRInfo | null; fetchedAt: number }>
  }
  /** Legacy single-blob session. Retained as the canonical 'local' execution
   *  host partition so an app downgrade still reads its workspace. Non-local
   *  hosts live in workspaceSessionsByHostId, keyed by ExecutionHostId. */
  workspaceSession: WorkspaceSessionState
  /** Per-execution-host session partitions for non-'local' hosts (ssh:/runtime:).
   *  Mixed-host writes stay isolated here; 'local' stays in workspaceSession so
   *  pre-partition builds keep working. Optional/absent on legacy files. */
  workspaceSessionsByHostId?: Partial<Record<ExecutionHostId, WorkspaceSessionState>>
  /** Daemon session ids of live local Claude launches. Seeds the Claude
   *  live-PTY gate on startup so an early OAuth refresh cannot rotate the
   *  single-use refresh token out from under a still-running daemon CLI. */
  claudeLivePtySessionIds?: string[]
  migrationUnsupportedPtyEntries: MigrationUnsupportedPtyEntry[]
  legacyPaneKeyAliasEntries: LegacyPaneKeyAliasEntry[]
  /** Pending and recently settled rate-limit resumes. Terminal entries are
   *  pruned by age on load. */
  rateLimitResumes?: RateLimitResumeSchedule[]
  onboarding: OnboardingState
  /** Main-owned telemetry de-dupe marker; never exposed through PersistedUIState. */
  featureInteractionTelemetryBuckets?: FeatureInteractionTelemetryBucketState
}
