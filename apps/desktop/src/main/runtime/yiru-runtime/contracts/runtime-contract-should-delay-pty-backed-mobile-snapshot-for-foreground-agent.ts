import type {
  FolderWorkspacePathStatus,
  FolderWorkspacePathStatusRequest
} from '~shared/folder-workspace-path-status'
import type {
  RuntimeTerminalAgentStatus,
  RuntimeTerminalWait,
  RuntimeTerminalWaitCondition,
  RuntimeWorktreePsSummary
} from '~shared/runtime-types'
import type {
  Project,
  ProjectUpdateArgs,
  ProjectHostSetup,
  ProjectHostSetupCloneArgs,
  ProjectHostSetupCreateArgs,
  ProjectHostSetupCreateResult,
  ProjectHostSetupDeleteArgs,
  ProjectHostSetupDeleteResult,
  ProjectHostSetupExistingFolderArgs,
  ProjectHostSetupResult,
  ProjectHostSetupUpdateArgs,
  ProjectHostSetupUpdateResult,
  Repo,
  ProjectGroup,
  FolderWorkspace
} from '~shared/types'

import type { RuntimePtyWorktreeRecord } from '../model/terminal-records'
import type { RuntimeWorktreeSummaryPathIndex } from '../model/worktree-identity'
import { RuntimeContractHandleMobileSubscribe } from './runtime-contract-handle-mobile-subscribe'

export abstract class RuntimeContractShouldDelayPtyBackedMobileSnapshotForForegroundAgent extends RuntimeContractHandleMobileSubscribe {
  protected abstract shouldDelayPtyBackedMobileSnapshotForForegroundAgent(
    pty: RuntimePtyWorktreeRecord,
    title: string
  ): boolean

  protected abstract refreshPtyForegroundAgent(ptyId: string): void

  protected abstract getPendingForegroundAgentRefreshForTitle(
    ptyId: string,
    titleObservedAt: number
  ): Promise<boolean> | undefined

  protected abstract delayPtyBackedMobileSnapshotForForegroundAgent(
    ptyId: string,
    titleObservedAt: number,
    foregroundRefresh: Promise<boolean>
  ): void

  protected abstract refreshPtyForegroundAgentFromController(
    ptyId: string,
    options?: { afterTitleObservation?: number }
  ): Promise<boolean>

  protected abstract loadPtyForegroundAgentFromController(ptyId: string): Promise<boolean>

  protected abstract getFreshExplicitAgentStatusForHandle(handle: string): {
    status: NonNullable<RuntimeTerminalAgentStatus['status']>
    updatedAt: number
  } | null

  protected abstract writeTerminalAction(
    ptyId: string,
    action: { text?: string; enter?: boolean; interrupt?: boolean },
    payload: string,
    options?: {
      beforeWrite?: (ptyId: string) => void | Promise<void>
      reserveWrite?: (ptyId: string) => void
      afterWrite?: (ptyId: string) => void | Promise<void>
      suffixFailureError?: string
    }
  ): Promise<void>

  protected abstract writeTerminalInputChunks(
    ptyId: string,
    text: string,
    options?: {
      beforeWrite?: (ptyId: string) => void | Promise<void>
      reserveWrite?: (ptyId: string) => void
      afterWrite?: (ptyId: string) => void | Promise<void>
    }
  ): Promise<void>

  protected abstract writeTerminalAgentPrompt(
    ptyId: string,
    pastePayload: string,
    options?: {
      beforeWrite?: (ptyId: string) => void | Promise<void>
      suffixFailureError?: string
    }
  ): Promise<void>

  abstract waitForTerminal(
    handle: string,
    options?: {
      condition?: RuntimeTerminalWaitCondition
      timeoutMs?: number
      signal?: AbortSignal
    }
  ): Promise<RuntimeTerminalWait>

  abstract getWorktreePs(
    limit?: number,
    clientKind?: 'mobile' | 'runtime'
  ): Promise<{
    worktrees: RuntimeWorktreePsSummary[]
    totalCount: number
    truncated: boolean
  }>

  protected abstract attachAgentRowsToSummaries(
    summaries: Map<string, RuntimeWorktreePsSummary>,
    runtimeWorktreeSummaryPathIndex: RuntimeWorktreeSummaryPathIndex,
    missingRuntimeWorktreeIds: Set<string>,
    mirroredWorktreeIdByTabId: ReadonlyMap<string, string>
  ): void

  abstract listRepos(): Repo[]

  abstract enrichMissingRepoGitRemoteIdentities(): void

  abstract listProjects(): Project[]

  abstract updateProject(projectId: string, updates: ProjectUpdateArgs['updates']): Project

  abstract listProjectHostSetups(): ProjectHostSetup[]

  abstract createProjectHostSetup(args: ProjectHostSetupCreateArgs): ProjectHostSetupCreateResult

  abstract setupProjectExistingFolder(
    args: ProjectHostSetupExistingFolderArgs
  ): Promise<ProjectHostSetupResult>

  abstract setupProjectClone(args: ProjectHostSetupCloneArgs): Promise<ProjectHostSetupResult>

  abstract updateProjectHostSetup(args: ProjectHostSetupUpdateArgs): ProjectHostSetupUpdateResult

  abstract deleteProjectHostSetup(args: ProjectHostSetupDeleteArgs): ProjectHostSetupDeleteResult

  abstract listProjectGroups(): ProjectGroup[]

  abstract listFolderWorkspaces(): FolderWorkspace[]

  abstract createProjectGroup(input: {
    name: string
    parentPath?: string | null
    connectionId?: string | null
    parentGroupId?: string | null
    createdFrom?: ProjectGroup['createdFrom']
  }): Promise<ProjectGroup>

  abstract updateProjectGroup(
    groupId: string,
    updates: Partial<Pick<ProjectGroup, 'name' | 'isCollapsed' | 'tabOrder' | 'color'>>
  ): Promise<ProjectGroup | null>

  abstract deleteProjectGroup(groupId: string): Promise<{ deleted: boolean }>

  abstract moveProjectToGroup(
    repoSelector: string,
    groupId: string | null,
    order?: number
  ): Promise<Repo>

  abstract createFolderWorkspace(input: {
    projectGroupId: string
    name?: string
    folderPath?: string | null
    connectionId?: string | null
    linkedReview?: FolderWorkspace['linkedReview']
    createdWithAgent?: FolderWorkspace['createdWithAgent']
    pendingFirstAgentMessageRename?: boolean
  }): Promise<FolderWorkspace>

  abstract getFolderWorkspacePathStatus(
    request: FolderWorkspacePathStatusRequest
  ): Promise<FolderWorkspacePathStatus>
}
