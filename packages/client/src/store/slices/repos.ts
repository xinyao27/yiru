import type { ExecutionHostId } from '@yiru/workbench-model/workspace'
import type { StateCreator } from 'zustand'
import type {
  FolderWorkspacePathStatus,
  FolderWorkspacePathStatusRequest
} from '~shared/folder-workspace-path-status'
import type {
  Project,
  Repo,
  ProjectGroup,
  ProjectHostSetup,
  FolderWorkspace,
  ProjectGroupImportResult,
  NestedRepoScanResult,
  ProjectHostSetupCloneArgs,
  ProjectHostSetupCreateArgs,
  ProjectHostSetupCreateResult,
  ProjectHostSetupDeleteArgs,
  ProjectHostSetupDeleteResult,
  ProjectHostSetupExistingFolderArgs,
  ProjectHostSetupResult,
  ProjectHostSetupUpdateArgs,
  ProjectHostSetupUpdateResult
} from '~shared/types'

import type { AppState } from '../types'
import { createRepoAddProjectActions } from './repo-add-project-actions'
import { createRepoCatalogActions } from './repo-catalog-actions'
import { createRepoHostSetupActions } from './repo-host-setup-actions'
import { createRepoNestedScanActions } from './repo-nested-scan-actions'
import { createRepoPathStatusActions } from './repo-path-status-actions'
import type {
  AddRepoPathRouteOptions,
  FolderWorkspacePathStatusRouteOptions
} from './repo-path-status-model'
import { createRepoProjectGroupActions } from './repo-project-group-actions'
import { createRepoRemoveProjectActions } from './repo-remove-project-actions'
import { createRepoUpdateActions } from './repo-update-actions'
import type {
  AllHostCatalogFetchOptions,
  DeleteProjectGroupWithContainedProjectsOptions,
  DeleteProjectGroupWithContainedProjectsResult,
  FolderWorkspacePathStatusCacheEntry,
  NestedRepoScanControls,
  ProjectUpdate,
  RepoUpdate
} from './repo-update-model'
import { createRepoWorkspaceCatalogActions } from './repo-workspace-catalog-actions'
export type {
  RepoUpdate,
  FolderWorkspacePathStatusCacheEntry,
  DeleteProjectGroupWithContainedProjectsOptions,
  ProjectRemovalFailure,
  DeleteProjectGroupWithContainedProjectsResult
} from './repo-update-model'

export type RepoSlice = {
  repos: Repo[]
  projects: Project[]
  projectHostSetups: ProjectHostSetup[]
  projectGroups: ProjectGroup[]
  folderWorkspaces: FolderWorkspace[]
  folderWorkspacePathStatuses: Record<string, FolderWorkspacePathStatusCacheEntry>
  activeRepoId: string | null
  // Monotonic sequence so an overlapping fetchRepos can drop its own stale result (#7020).
  reposFetchGeneration: number
  fetchRepos: () => Promise<void>
  fetchReposForAllHosts: (options?: AllHostCatalogFetchOptions) => Promise<void>
  fetchRuntimeEnvironmentRepos: (environmentId: string) => Promise<Repo[]>
  fetchProjectGroups: () => Promise<void>
  fetchProjectGroupsForAllHosts: (options?: AllHostCatalogFetchOptions) => Promise<void>
  fetchFolderWorkspaces: () => Promise<void>
  fetchFolderWorkspacesForAllHosts: (options?: AllHostCatalogFetchOptions) => Promise<void>
  addRepo: () => Promise<Repo | null>
  addRepoPath: (
    path: string,
    kind?: 'git' | 'folder',
    options?: AddRepoPathRouteOptions
  ) => Promise<Repo | null>
  setupProjectExistingFolder: (
    args: ProjectHostSetupExistingFolderArgs
  ) => Promise<ProjectHostSetupResult | null>
  createProjectHostSetup: (
    args: ProjectHostSetupCreateArgs
  ) => Promise<ProjectHostSetupCreateResult | null>
  updateProjectHostSetup: (
    args: ProjectHostSetupUpdateArgs
  ) => Promise<ProjectHostSetupUpdateResult | null>
  deleteProjectHostSetup: (
    args: ProjectHostSetupDeleteArgs
  ) => Promise<ProjectHostSetupDeleteResult | null>
  setupProjectClone: (args: ProjectHostSetupCloneArgs) => Promise<ProjectHostSetupResult | null>
  registerNonGitFolder: (path: string, options?: AddRepoPathRouteOptions) => Promise<Repo | null>
  scanNestedRepos: (
    path: string,
    controls?: NestedRepoScanControls
  ) => Promise<NestedRepoScanResult | null>
  cancelNestedRepoScan: (scanId: string) => Promise<boolean>
  importNestedRepos: (args: {
    parentPath: string
    groupName: string
    projectPaths: string[]
    scanId?: string
    mode: 'group' | 'separate'
  }) => Promise<ProjectGroupImportResult | null>
  createProjectGroup: (name: string) => Promise<ProjectGroup | null>
  createFolderWorkspace: (
    args: {
      projectGroupId: string
      name?: string
      folderPath?: string | null
      connectionId?: string | null
      linkedReview?: FolderWorkspace['linkedReview']
      createdWithAgent?: FolderWorkspace['createdWithAgent']
      pendingFirstAgentMessageRename?: boolean
    },
    options?: FolderWorkspacePathStatusRouteOptions
  ) => Promise<FolderWorkspace | null>
  getFolderWorkspacePathStatusCacheKey: (
    request: FolderWorkspacePathStatusRequest,
    options?: FolderWorkspacePathStatusRouteOptions
  ) => string
  getFreshFolderWorkspacePathStatus: (
    request: FolderWorkspacePathStatusRequest,
    options?: FolderWorkspacePathStatusRouteOptions
  ) => FolderWorkspacePathStatus | null
  fetchFolderWorkspacePathStatus: (
    request: FolderWorkspacePathStatusRequest,
    options?: { force?: boolean } & FolderWorkspacePathStatusRouteOptions
  ) => Promise<FolderWorkspacePathStatus | null>
  updateFolderWorkspace: (
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
  ) => Promise<boolean>
  deleteFolderWorkspace: (folderWorkspaceId: string) => Promise<boolean>
  updateProjectGroup: (
    groupId: string,
    updates: Partial<Pick<ProjectGroup, 'name' | 'isCollapsed' | 'tabOrder' | 'color'>>
  ) => Promise<boolean>
  deleteProjectGroup: (groupId: string) => Promise<boolean>
  deleteProjectGroupWithContainedProjects: (
    groupId: string,
    options: DeleteProjectGroupWithContainedProjectsOptions
  ) => Promise<DeleteProjectGroupWithContainedProjectsResult>
  moveProjectToGroup: (
    projectId: string,
    groupId: string | null,
    order?: number
  ) => Promise<boolean>
  // options.hostId disambiguates which host's row to remove when the same repo
  // id exists on multiple hosts; without it the focused host is assumed.
  removeProject: (projectId: string, options?: { hostId?: ExecutionHostId }) => Promise<void>
  updateProject: (projectId: string, updates: ProjectUpdate) => Promise<boolean>
  // options.hostId targets a specific host's repo row + RPC target when the same
  // repo id exists on multiple hosts; without it the focused host is assumed.
  updateRepo: (
    projectId: string,
    updates: RepoUpdate,
    options?: { hostId?: ExecutionHostId }
  ) => Promise<boolean>
  setActiveRepo: (projectId: string | null) => void
  reorderRepos: (orderedIds: string[]) => Promise<void>
}

export const createRepoSlice: StateCreator<AppState, [], [], RepoSlice> = (set, get) => ({
  repos: [],
  projects: [],
  projectHostSetups: [],
  projectGroups: [],
  folderWorkspaces: [],
  folderWorkspacePathStatuses: {},
  activeRepoId: null,
  reposFetchGeneration: 0,

  ...createRepoCatalogActions(set, get),
  ...createRepoWorkspaceCatalogActions(set, get),
  ...createRepoPathStatusActions(set, get),
  ...createRepoNestedScanActions(set, get),
  ...createRepoProjectGroupActions(set, get),
  ...createRepoAddProjectActions(set, get),
  ...createRepoHostSetupActions(set, get),
  ...createRepoRemoveProjectActions(set, get),

  ...createRepoUpdateActions(set, get)
})
