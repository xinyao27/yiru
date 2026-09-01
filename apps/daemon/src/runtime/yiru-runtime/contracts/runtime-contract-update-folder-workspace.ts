import type { ExecutionHostId } from '@yiru/runtime-protocol/model/workspace'
import type { RuntimeWorkspaceOpenPathResult } from '@yiru/runtime-protocol/workbench/runtime-types'
import type {
  Repo,
  NestedRepoScanResult,
  FolderWorkspace,
  ProjectGroupImportMode,
  ProjectGroupImportResult,
  DirEntry
} from '@yiru/runtime-protocol/workbench/types'
import type {
  WorkspaceCleanupDismissal,
  WorkspaceCleanupScanArgs,
  WorkspaceCleanupScanResult
} from '@yiru/runtime-protocol/workbench/workspace/cleanup'
import type { WorkspaceSpaceAnalyzeResult } from '@yiru/runtime-protocol/workbench/workspace/space-types'
import type { SparsePreset } from '@yiru/runtime-protocol/workbench/worktree-operation-types'

import type { ResolvedWorktree } from '../model/worktree-resolution'
import { RuntimeContractShouldDelayPtyBackedMobileSnapshotForForegroundAgent } from './runtime-contract-should-delay-pty-backed-mobile-snapshot-for-foreground-agent'

export abstract class RuntimeContractUpdateFolderWorkspace extends RuntimeContractShouldDelayPtyBackedMobileSnapshotForForegroundAgent {
  abstract updateFolderWorkspace(
    folderWorkspaceId: string,
    updates: Partial<
      Pick<
        FolderWorkspace,
        | 'name'
        | 'folderPath'
        | 'linkedReview'
        | 'comment'
        | 'isArchived'
        | 'isUnread'
        | 'isPinned'
        | 'sortOrder'
        | 'manualOrder'
        | 'workspaceStatus'
        | 'createdWithAgent'
        | 'pendingFirstAgentMessageRename'
        | 'firstAgentMessageRenameError'
        | 'lastActivityAt'
      >
    >
  ): Promise<FolderWorkspace | null>

  abstract deleteFolderWorkspace(folderWorkspaceId: string): Promise<{ deleted: boolean }>

  abstract scanNestedRepos(
    path: string,
    requestOptions?: { scanId?: string; options?: unknown }
  ): Promise<NestedRepoScanResult>

  abstract scanWorkspaceCleanup(args: WorkspaceCleanupScanArgs): Promise<WorkspaceCleanupScanResult>

  abstract dismissWorkspaceCleanupCandidates(
    dismissals: readonly WorkspaceCleanupDismissal[]
  ): Record<string, WorkspaceCleanupDismissal>

  abstract clearWorkspaceCleanupDismissals(): Record<string, WorkspaceCleanupDismissal>

  abstract analyzeWorkspaceSpace(): Promise<WorkspaceSpaceAnalyzeResult>

  abstract cancelWorkspaceSpaceScan(): boolean

  abstract cancelNestedRepoScan(scanId: string): { cancelled: boolean }

  abstract browseServerDir(
    pathValue: string
  ): Promise<{ resolvedPath: string; entries: DirEntry[] }>

  abstract isGitAvailable(): Promise<boolean>

  abstract importNestedRepos(args: {
    parentPath: string
    groupName: string
    projectPaths: string[]
    scanId?: string
    mode: ProjectGroupImportMode
  }): Promise<ProjectGroupImportResult>

  abstract listSparsePresets(repoSelector: string): Promise<SparsePreset[]>

  abstract saveSparsePreset(
    repoSelector: string,
    args: { id?: string; name: string; directories: string[] }
  ): Promise<SparsePreset>

  abstract removeSparsePreset(repoSelector: string, presetId: string): Promise<void>

  abstract openWorkspacePath(
    path: string,
    contextWorktree?: string
  ): Promise<RuntimeWorkspaceOpenPathResult>

  protected abstract openWorkspacePathNow(
    path: string,
    contextWorktree?: string
  ): Promise<RuntimeWorkspaceOpenPathResult>

  protected abstract activateWorkspacePathTarget(
    requestedPath: string,
    worktree: ResolvedWorktree,
    disposition: RuntimeWorkspaceOpenPathResult['disposition']
  ): Promise<RuntimeWorkspaceOpenPathResult>

  abstract addRepo(
    path: string,
    kind?: 'git' | 'folder',
    executionHostId?: ExecutionHostId | null
  ): Promise<Repo>

  abstract createRepo(
    parentPath: string,
    name: string,
    kind?: 'git' | 'folder'
  ): Promise<{ repo: Repo } | { error: string }>

  abstract cloneRepo(
    url: string,
    destination: string,
    executionHostId?: ExecutionHostId | null
  ): Promise<Repo>

  abstract abortRepoClone(): void

  protected abstract cloneRepoAfterPathLock(
    trimmedUrl: string,
    trimmedDestination: string,
    clonePath: string,
    clonePathKey: string,
    executionHostId?: ExecutionHostId | null
  ): Promise<Repo>

  abstract showRepo(repoSelector: string): Promise<Repo>

  abstract setRepoBaseRef(repoSelector: string, baseRef: string): Promise<Repo>

  abstract updateRepo(
    repoSelector: string,
    updates: Partial<
      Pick<
        Repo,
        | 'displayName'
        | 'badgeColor'
        | 'repoIcon'
        | 'upstream'
        | 'hookSettings'
        | 'worktreeBaseRef'
        | 'worktreeBasePath'
        | 'kind'
        | 'symlinkPaths'
        | 'forgeRemotePreference'
        | 'externalWorktreeVisibility'
        | 'externalWorktreeVisibilityPromptDismissedAt'
        | 'externalWorktreeInboxBaselinePaths'
        | 'importedExternalWorktreePaths'
        | 'projectGroupId'
        | 'projectGroupOrder'
      >
    > & {
      sourceControlAi?: Repo['sourceControlAi'] | null
      externalWorktreeDiscoverySuppressedAt?: Repo['externalWorktreeDiscoverySuppressedAt'] | null
    }
  ): Promise<Repo>

  abstract removeProject(repoSelector: string): Promise<{ removed: true }>

  abstract inspectTerminalProcess(
    terminalSelector: string
  ): Promise<{ foregroundProcess: string | null; hasChildProcesses: boolean }>

  abstract reorderRepos(orderedIds: string[]): { status: 'applied' | 'rejected' }
}
