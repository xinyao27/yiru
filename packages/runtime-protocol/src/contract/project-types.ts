import type { ExecutionHostId, RepoIcon, RepoKind } from '../model/workspace.js'
import type {
  RuntimeGitRemoteIdentity,
  RuntimeRepo,
  RuntimeRepoHookSettings,
  RuntimeRepoSourceControlAiOverrides
} from './repo-types.js'

export type RuntimeLocalWindowsRuntimePreference =
  | { kind: 'inherit-global' }
  | { kind: 'windows-host' }
  | { kind: 'wsl'; distro: string }

export type RuntimeProjectProviderIdentity = {
  provider: 'github'
  owner: string
  repo: string
}

export type RuntimeProject = {
  id: string
  displayName: string
  badgeColor: string
  repoIcon?: RepoIcon | null
  kind?: RepoKind
  providerIdentity?: RuntimeProjectProviderIdentity
  gitRemoteIdentity?: RuntimeGitRemoteIdentity
  localWindowsRuntimePreference?: RuntimeLocalWindowsRuntimePreference
  sourceRepoIds: string[]
  createdAt: number
  updatedAt: number
}

export type RuntimeProjectHostSetupState =
  | 'ready'
  | 'not-set-up'
  | 'setting-up'
  | 'error'
  | 'unsupported'
export type RuntimeProjectHostSetupMethod =
  | 'legacy-repo'
  | 'imported-existing-folder'
  | 'cloned'
  | 'provisioned'

export type RuntimeProjectHostSetup = {
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
  hookSettings?: RuntimeRepoHookSettings
  gitUsername?: string
  setupState: RuntimeProjectHostSetupState
  setupMethod: RuntimeProjectHostSetupMethod
  sourceControlAi?: RuntimeRepoSourceControlAiOverrides
  createdAt: number
  updatedAt: number
}

export type RuntimeProjectListResult = { projects: RuntimeProject[]; revision?: number }
export type RuntimeProjectResult = { project: RuntimeProject; revision?: number }
export type RuntimeProjectHostSetupListResult = {
  setups: RuntimeProjectHostSetup[]
  revision?: number
}
export type RuntimeProjectHostSetupResult = {
  project: RuntimeProject
  setup: RuntimeProjectHostSetup
  repo: RuntimeRepo
}
export type RuntimeProjectHostSetupCreateResult = {
  project: RuntimeProject
  setup: RuntimeProjectHostSetup
}
export type RuntimeProjectHostSetupUpdateResult = {
  project: RuntimeProject
  setup: RuntimeProjectHostSetup
  repo?: RuntimeRepo
}
export type RuntimeProjectHostSetupDeleteResult = RuntimeProjectHostSetupUpdateResult

export type RuntimeProjectHostSetupResultEnvelope = {
  result: RuntimeProjectHostSetupResult
  revision?: number
}
export type RuntimeProjectHostSetupCreateResultEnvelope = {
  result: RuntimeProjectHostSetupCreateResult
  revision?: number
}
export type RuntimeProjectHostSetupUpdateResultEnvelope = {
  result: RuntimeProjectHostSetupUpdateResult
  revision?: number
}
export type RuntimeProjectHostSetupDeleteResultEnvelope = {
  result: RuntimeProjectHostSetupDeleteResult
  revision?: number
}
