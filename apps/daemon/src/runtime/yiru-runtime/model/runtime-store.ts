import type { GlobalSettings } from '@yiru/runtime-protocol/workbench/types'
import type { Store } from '~main/persistence/store'
import { normalizeSparseDirectories } from '~main/sparse-checkout-directories'

export type RemoteFetchResult = { ok: true } | { ok: false; errorKind: 'git_error' }

export type RemoteTrackingBase = {
  remote: string
  branch: string
  ref: string
  base: string
}

export type RuntimeStore = {
  getRepos: Store['getRepos']
  getRepo: Store['getRepo']
  addRepo: Store['addRepo']
  updateRepo: Store['updateRepo']
  getProjects?: Store['getProjects']
  updateProject?: Store['updateProject']
  getProjectHostSetups?: Store['getProjectHostSetups']
  createProjectHostSetup?: Store['createProjectHostSetup']
  updateProjectHostSetup?: Store['updateProjectHostSetup']
  deleteProjectHostSetup?: Store['deleteProjectHostSetup']
  getProjectGroups?: Store['getProjectGroups']
  createProjectGroup?: Store['createProjectGroup']
  updateProjectGroup?: Store['updateProjectGroup']
  deleteProjectGroup?: Store['deleteProjectGroup']
  moveProjectToGroup?: Store['moveProjectToGroup']
  getFolderWorkspaces?: Store['getFolderWorkspaces']
  createFolderWorkspace?: Store['createFolderWorkspace']
  updateFolderWorkspace?: Store['updateFolderWorkspace']
  removeFolderWorkspace?: Store['removeFolderWorkspace']
  removeProject?: Store['removeProject']
  reorderRepos?: Store['reorderRepos']
  getAllWorktreeMeta: Store['getAllWorktreeMeta']
  getWorktreeMeta: Store['getWorktreeMeta']
  setWorktreeMeta: Store['setWorktreeMeta']
  removeWorktreeMeta: Store['removeWorktreeMeta']
  getWorktreeLineage?: Store['getWorktreeLineage']
  getAllWorktreeLineage?: Store['getAllWorktreeLineage']
  setWorktreeLineage?: Store['setWorktreeLineage']
  removeWorktreeLineage?: Store['removeWorktreeLineage']
  getAllWorkspaceLineage?: Store['getAllWorkspaceLineage']
  setWorkspaceLineage?: Store['setWorkspaceLineage']
  removeWorkspaceLineage?: Store['removeWorkspaceLineage']
  getGitHubCache: Store['getGitHubCache']
  getWorkspaceSession?: Store['getWorkspaceSession']
  setWorkspaceSession?: Store['setWorkspaceSession']
  patchWorkspaceSession?: Store['patchWorkspaceSession']
  flushOrThrow?: Store['flushOrThrow']
  persistPtyBinding?: Store['persistPtyBinding']
  getUI?: Store['getUI']
  updateUI?: Store['updateUI']
  recordFeatureInteraction?: Store['recordFeatureInteraction']
  getSparsePresets?: Store['getSparsePresets']
  saveSparsePreset?: Store['saveSparsePreset']
  removeSparsePreset?: Store['removeSparsePreset']
  getSettings(): {
    workspaceDir: string
    nestWorkspaces: boolean
    refreshLocalBaseRefOnWorktreeCreate: boolean
    localBaseRefSuggestionDismissed?: boolean
    branchPrefix: GlobalSettings['branchPrefix']
    branchPrefixCustom: string
    defaultTuiAgent?: GlobalSettings['defaultTuiAgent']
    disabledTuiAgents?: GlobalSettings['disabledTuiAgents']
    agentCmdOverrides?: GlobalSettings['agentCmdOverrides']
    agentDefaultArgs?: GlobalSettings['agentDefaultArgs']
    agentDefaultEnv?: GlobalSettings['agentDefaultEnv']
    terminalWindowsShell?: GlobalSettings['terminalWindowsShell']
    agentStatusHooksEnabled?: GlobalSettings['agentStatusHooksEnabled']
    minimaxGroupId?: GlobalSettings['minimaxGroupId']
    minimaxUsageModels?: GlobalSettings['minimaxUsageModels']
    prBotAuthorOverrides?: GlobalSettings['prBotAuthorOverrides']
    terminalQuickCommands?: GlobalSettings['terminalQuickCommands']
    mobileAutoRestoreFitMs?: number | null
    mobileEmulatorEnabled?: boolean
    mobileEmulatorDefaultDeviceUdid?: string | null
    claudeAgentTeamsMode?: GlobalSettings['claudeAgentTeamsMode']
    notifications?: GlobalSettings['notifications']
  }
  // The runtime never reads the return value; it reads persisted settings on
  // the next access.
  updateSettings?: (
    updates: Partial<GlobalSettings>,
    options?: { notifyListeners?: boolean; originClientId?: number }
  ) => GlobalSettings
}

export function normalizeSparsePresetName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) {
    throw new Error('Preset name is required.')
  }
  if (trimmed.length > 80) {
    throw new Error('Preset name is too long.')
  }
  return trimmed
}

export function normalizeSparsePresetDirectoriesForSave(directories: string[]): string[] {
  let normalized: string[]
  try {
    normalized = normalizeSparseDirectories(directories)
  } catch (err) {
    if (
      err instanceof Error &&
      err.message === 'Sparse checkout directories must be repo-relative paths.'
    ) {
      throw new Error('Preset directories must be repo-relative paths.')
    }
    throw err
  }
  if (normalized.length === 0) {
    throw new Error('Preset must have at least one directory.')
  }
  return normalized
}
