import type { ExecutionHostId } from '@yiru/runtime-protocol/model/workspace'
import type { ProjectExecutionRuntimeResolution } from '@yiru/runtime-protocol/workbench/project-execution-runtime'
import type {
  RuntimeWorktreePsSummary,
  RuntimeTerminalSummary,
  RuntimeSyncedLeaf
} from '@yiru/runtime-protocol/workbench/runtime-types'
import type {
  GitWorktreeInfo,
  Repo,
  WorktreeLineage,
  WorkspaceLineage,
  WorkspaceKey,
  FolderWorkspace
} from '@yiru/runtime-protocol/workbench/types'
import type { Store } from '~main/persistence/store'
import type { OrchestrationDb } from '~main/runtime/orchestration/db'

import type { RuntimeLeafRecord, RuntimePtyWorktreeRecord } from '../model/terminal-records'
import type { RuntimeWorktreeSummaryPathIndex } from '../model/worktree-identity'
import type {
  ResolvedWorkspaceParent,
  ResolvedWorktree,
  ResolvedWorktreeSnapshot,
  RuntimeWorktreeScanResult,
  TerminalWorkspaceLaunchScope,
  WorktreeLineageCandidate,
  WorktreeLineageInput,
  WorktreeLineageResolution
} from '../model/worktree-resolution'
import { RuntimeContractCreateHeadlessMobileSessionTerminal } from './runtime-contract-create-headless-mobile-session-terminal'

export abstract class RuntimeContractResolveFolderWorkspaceLaunchScope extends RuntimeContractCreateHeadlessMobileSessionTerminal {
  protected abstract resolveFolderWorkspaceLaunchScope(
    selector: string
  ): Promise<TerminalWorkspaceLaunchScope | null>

  protected abstract folderWorkspaceToResolvedWorktree(
    folderWorkspace: FolderWorkspace
  ): ResolvedWorktree

  protected abstract resolveWorkspaceTerminalStartupCwd(
    workspace: Pick<TerminalWorkspaceLaunchScope, 'path'>,
    requestedCwd?: string | null
  ): string | undefined

  protected abstract resolveTerminalWorkspaceLaunchScope(
    selector: string
  ): Promise<TerminalWorkspaceLaunchScope>

  protected abstract buildTerminalWorkspaceEnv(
    scope: TerminalWorkspaceLaunchScope,
    baseEnv: Record<string, string>,
    paneKey: string,
    tabId: string,
    agentTeamsEnv?: Record<string, string>
  ): Record<string, string>

  protected abstract getValidatedExplicitWorktreeIdSelector(
    selector: string | undefined
  ): string | null

  protected abstract resolveWorktreeSelector(selector: string): Promise<ResolvedWorktree>

  protected abstract resolveWorkspaceParentSelector(
    selector: string
  ): Promise<ResolvedWorkspaceParent>

  protected abstract validateLineageParent(child: ResolvedWorktree, parent: ResolvedWorktree): void

  protected abstract resolveLineageForWorktreeCreate(
    input?: WorktreeLineageInput
  ): Promise<WorktreeLineageResolution>

  protected abstract resolveLineageCandidateForTaskId(
    taskId: string
  ): Promise<WorktreeLineageCandidate | null>

  protected abstract getOrchestrationDbIfAvailable(): OrchestrationDb | null

  abstract hydrateInferredWorktreeLineage(): Promise<void>

  abstract listWorktreeLineage(): Promise<Record<string, WorktreeLineage>>

  abstract listWorkspaceLineage(): Promise<Record<WorkspaceKey, WorkspaceLineage>>

  protected abstract resolveRepoSelector(
    selector: string,
    executionHostId?: ExecutionHostId
  ): Promise<Repo>

  protected abstract requireStore(): Store

  protected abstract buildResolvedWorktreeFromId(worktreeId: string): ResolvedWorktree | null

  protected abstract listKnownResolvedWorktreesForExplicitTarget(
    targetWorktreeId: string,
    targetWorktree: ResolvedWorktree | null
  ): ResolvedWorktree[]

  protected abstract listResolvedWorktrees(): Promise<ResolvedWorktree[]>

  protected abstract listResolvedWorktreeSnapshot(): Promise<ResolvedWorktreeSnapshot>

  protected abstract computeResolvedWorktrees(generation: number): Promise<ResolvedWorktreeSnapshot>

  protected abstract attachLineageToResolvedWorktrees(
    worktrees: ResolvedWorktree[]
  ): ResolvedWorktree[]

  protected abstract pruneLineageForMissingRepoWorktrees(
    repo: Repo,
    gitWorktrees: GitWorktreeInfo[]
  ): void

  protected abstract listRepoWorktreesForResolution(
    repo: Repo,
    projectRuntimeByRepoId?: ReadonlyMap<string, ProjectExecutionRuntimeResolution>
  ): Promise<RuntimeWorktreeScanResult>

  protected abstract getResolvedWorktreeMap(): Promise<Map<string, ResolvedWorktree>>

  protected abstract invalidateResolvedWorktreeCache(): void

  abstract notifyBranchRenamed(repoId: string): void

  abstract notifyWorktreeFolderRenamed(
    repoId: string,
    oldWorktreeId: string,
    newWorktreeId: string
  ): void

  abstract notifyFolderWorkspaceChanged(): void

  protected abstract recordPtyWorktree(
    ptyId: string,
    worktreeId: string,
    state?: Partial<
      Pick<
        RuntimePtyWorktreeRecord,
        | 'connected'
        | 'lastOutputAt'
        | 'preview'
        | 'tabId'
        | 'paneKey'
        | 'title'
        | 'connectionId'
        | 'isWsl'
      >
    >
  ): RuntimePtyWorktreeRecord

  protected abstract makeRuntimePaneKey(
    leaf: Pick<RuntimeSyncedLeaf, 'tabId' | 'leafId' | 'paneRuntimeId'>
  ): string

  protected abstract getOrCreatePtyWorktreeRecord(ptyId: string): RuntimePtyWorktreeRecord | null

  protected abstract refreshPtyWorktreeRecordsFromController(
    resolvedWorktrees: ResolvedWorktree[],
    targetWorktreeId?: string | null
  ): Promise<Set<string> | null>

  protected abstract pruneDisconnectedPtyTranscript(pty: RuntimePtyWorktreeRecord): void

  protected abstract pruneDisconnectedPtyRecords(): void

  protected abstract dropDisconnectedPtyRecord(ptyId: string): void

  protected abstract leafExistsForPty(ptyId: string): boolean

  protected abstract getLeavesForPty(ptyId: string): RuntimeLeafRecord[]

  protected abstract getSummaryForRuntimeWorktreeId(
    summaries: Map<string, RuntimeWorktreePsSummary>,
    runtimeWorktreeSummaryPathIndex: RuntimeWorktreeSummaryPathIndex,
    missingRuntimeWorktreeIds: Set<string>,
    runtimeWorktreeId: string
  ): RuntimeWorktreePsSummary | null

  protected abstract buildTerminalSummary(
    leaf: RuntimeLeafRecord,
    worktreesById: Map<string, ResolvedWorktree>
  ): RuntimeTerminalSummary
}
