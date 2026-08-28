import type { ExecutionHostId, RepoIcon } from '@yiru/runtime-protocol/model/workspace'
import type * as WorkbenchWorkspaceTypes from '@yiru/runtime-protocol/model/workspace'

import type { GitRemoteIdentity } from './git/remote-identity'
import type { LocalWindowsRuntimePreference } from './project-execution-runtime'
import type { Repo } from './repository-workspace-types'
import type { RepoSourceControlAiOverrides } from './source-control/ai-types'
import type { RepoHookSettings } from './worktree-operation-types'

export type ShellHydrationFailureReason =
  | 'none'
  | 'no_shell'
  | 'timeout'
  | 'spawn_error'
  | 'empty_path'

export type PathSource = 'shell_hydrate' | 'sync_seed_only'

// ─── Repo ────────────────────────────────────────────────────────────
export type RepoKind = WorkbenchWorkspaceTypes.RepoKind

/** Per-repo remote preference for hosted forge metadata. */
export type ForgeRemotePreference = 'upstream' | 'origin' | 'auto'
export type { ForkSyncMode, GitForkSyncExpectedUpstream, GitForkSyncResult } from './git/fork-sync'
export type ExternalWorktreeVisibility = 'hide' | 'show'

export type ProjectProviderIdentity = {
  provider: 'github'
  owner: string
  repo: string
}

export type Project = {
  id: string
  displayName: string
  badgeColor: string
  repoIcon?: RepoIcon | null
  kind?: RepoKind
  providerIdentity?: ProjectProviderIdentity
  gitRemoteIdentity?: GitRemoteIdentity
  /** Local Windows projects inherit the global runtime default unless this override is set. */
  localWindowsRuntimePreference?: LocalWindowsRuntimePreference
  sourceRepoIds: string[]
  createdAt: number
  updatedAt: number
}

export type ProjectUpdateArgs = {
  projectId: string
  updates: Partial<Pick<Project, 'localWindowsRuntimePreference'>>
}

export type ProjectHostSetupState = 'ready' | 'not-set-up' | 'setting-up' | 'error' | 'unsupported'
export type ProjectHostSetupMethod =
  | 'legacy-repo'
  | 'imported-existing-folder'
  | 'cloned'
  | 'provisioned'
export type RepoProjectHostSetupMethod = Extract<
  ProjectHostSetupMethod,
  'imported-existing-folder' | 'cloned'
>

export type ProjectHostSetup = {
  id: string
  projectId: string
  hostId: ExecutionHostId
  repoId: string
  path: string
  displayName: string
  kind?: RepoKind
  connectionId?: string | null
  executionHostId?: ExecutionHostId | null
  worktreeBasePath?: string
  hookSettings?: RepoHookSettings
  gitUsername?: string
  setupState: ProjectHostSetupState
  setupMethod: ProjectHostSetupMethod
  sourceControlAi?: RepoSourceControlAiOverrides
  createdAt: number
  updatedAt: number
}

export type ProjectHostSetupExistingFolderArgs = {
  projectId: string
  hostId: ExecutionHostId
  path: string
  kind?: RepoKind
  displayName?: string
  setupMethod?: RepoProjectHostSetupMethod
}

export type ProjectHostSetupCreateArgs = {
  projectId: string
  hostId: ExecutionHostId
  setupId?: string
  path?: string
  kind?: RepoKind
  displayName?: string
  worktreeBasePath?: string
  gitUsername?: string
  setupState?: ProjectHostSetupState
  setupMethod?: Exclude<ProjectHostSetupMethod, 'legacy-repo'>
}

export type ProjectHostSetupCloneArgs = {
  projectId: string
  hostId: ExecutionHostId
  url: string
  destination: string
  displayName?: string
}

export type ProjectHostSetupUpdateArgs = {
  setupId: string
  updates: Partial<
    Pick<
      ProjectHostSetup,
      | 'displayName'
      | 'path'
      | 'worktreeBasePath'
      | 'setupState'
      | 'setupMethod'
      | 'gitUsername'
      | 'kind'
    >
  >
}

export type ProjectHostSetupDeleteArgs = {
  setupId: string
}

export type ProjectHostSetupResult = {
  project: Project
  setup: ProjectHostSetup
  repo: Repo
}

export type ProjectHostSetupCreateResult = {
  project: Project
  setup: ProjectHostSetup
}

export type ProjectHostSetupUpdateResult = {
  project: Project
  setup: ProjectHostSetup
  repo?: Repo
}

export type ProjectHostSetupDeleteResult = {
  project: Project
  setup: ProjectHostSetup
  repo?: Repo
}
