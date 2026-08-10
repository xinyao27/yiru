import type { TuiAgent } from '@yiru/workbench-model/agent'
import type { GitHubRepositoryIdentity } from '@yiru/workbench-model/review'
import type {
  BaseRefSearchResult,
  ExecutionHostId,
  RepoIcon,
  RepoKind
} from '@yiru/workbench-model/workspace'

export type RuntimeSourceControlOperation = 'commitMessage' | 'pullRequest' | 'branchName'
export type RuntimeSourceControlActionId =
  | RuntimeSourceControlOperation
  | 'fixCommitFailure'
  | 'fixPushFailure'
  | 'fixChecks'
  | 'resolveConflicts'
  | 'resolveComments'

export type RuntimeSourceControlModelChoice = {
  selectedModelByAgent?: Partial<Record<TuiAgent, string>>
  selectedModelByAgentByHost?: Partial<Record<string, Partial<Record<TuiAgent, string>>>>
  selectedThinkingByModel?: Record<string, string>
}

export type RuntimeRepoSourceControlAiOverrides = {
  enabled?: boolean
  customAgentCommand?: string
  modelOverridesByOperation?: Partial<
    Record<RuntimeSourceControlOperation, RuntimeSourceControlModelChoice>
  >
  instructionsByOperation?: Partial<Record<RuntimeSourceControlOperation, string | null>>
  actionOverrides?: Partial<
    Record<
      RuntimeSourceControlActionId,
      {
        agentId?: TuiAgent | 'custom' | null
        commandInputTemplate?: string | null
        agentArgs?: string | null
      }
    >
  >
  prCreationDefaults?: {
    draft?: boolean | null
    useTemplate?: boolean | null
    generateDetailsOnOpen?: boolean | null
    openAfterCreate?: boolean | null
  }
}

export type RuntimeRepoHookSettings = {
  mode: 'auto' | 'override'
  setupRunPolicy?: 'ask' | 'run-by-default' | 'skip-by-default'
  setupAgentStartupPolicy?: 'start-immediately' | 'wait-for-setup'
  commandSourcePolicy?: 'shared-only' | 'local-only' | 'run-both'
  scripts: { setup: string; archive: string }
}

export type RuntimeGitRemoteIdentity = {
  canonicalKey: string
  remoteName: string
  remoteUrl: string
}

export type RuntimeRepo = {
  id: string
  path: string
  displayName: string
  badgeColor: string
  repoIcon?: RepoIcon | null
  upstream?: GitHubRepositoryIdentity | null
  addedAt: number
  kind?: RepoKind
  gitUsername?: string
  worktreeBaseRef?: string
  worktreeBasePath?: string
  hookSettings?: RuntimeRepoHookSettings
  connectionId?: string | null
  executionHostId?: ExecutionHostId | null
  forgeRemotePreference?: 'upstream' | 'origin' | 'auto'
  forkSyncMode?: 'ask' | 'safe-auto' | 'off'
  gitRemoteIdentity?: RuntimeGitRemoteIdentity | null
  externalWorktreeVisibility?: 'hide' | 'show'
  externalWorktreeVisibilityLegacy?: boolean
  externalWorktreeVisibilityPromptDismissedAt?: number
  externalWorktreeInboxBaselinePaths?: string[]
  importedExternalWorktreePaths?: string[]
  externalWorktreeDiscoverySuppressedAt?: number
  symlinkPaths?: string[]
  projectGroupId?: string | null
  projectGroupOrder?: number
  sourceControlAi?: RuntimeRepoSourceControlAiOverrides
  projectHostSetupMethod?: 'imported-existing-folder' | 'cloned'
}

export type RuntimeSparsePreset = {
  id: string
  repoId: string
  name: string
  directories: string[]
  createdAt: number
  updatedAt: number
}

export type RuntimeYiruHooks = {
  scripts: { setup?: string; archive?: string }
  defaultTabs?: { title?: string; color?: string; command?: string }[]
  worktree?: { sharedDirectories: string[] }
}

export type RuntimeRepoHooksResult = {
  hasHooksFile: boolean
  hooks: RuntimeYiruHooks | null
  setupRunPolicy: 'ask' | 'run-by-default' | 'skip-by-default'
  source: 'yiru.yaml' | 'legacy' | null
  setupTrust?: { contentHash: string; scriptContent: string }
}

export type RuntimeRepoHooksCheckResult = {
  // Why: mirrors the preload `hooks.check` member this replaces — callers
  // treat inspection failures as "skip" and must be able to tell a confirmed
  // hook-free repo (status: 'ok') apart from an unresolved/ambiguous selector
  // (status: 'error') without relying on a thrown exception.
  status?: 'ok' | 'error'
  hasHooks: boolean
  hooks: RuntimeYiruHooks | null
  mayNeedUpdate: boolean
}

export type RuntimeSetupScriptImportCandidate = {
  provider: 'superset' | 'conductor' | 'codex' | 'cmux' | 'package-manager'
  label: string
  files: string[]
  setup: string
  archive?: string
  unsupportedFields?: string[]
}

export type RuntimeRepoListResult = { repos: RuntimeRepo[] }
export type RuntimeRepoResult = { repo: RuntimeRepo }
export type RuntimeRepoCreateResult = RuntimeRepoResult | { error: string }
export type RuntimeRepoRemoveResult = { removed: true }
export type RuntimeRepoReorderResult = { status: 'applied' | 'rejected' }
export type RuntimeRepoGitAvailableResult = { available: boolean }
export type RuntimeRepoSparsePresetsResult = { presets: RuntimeSparsePreset[] }
export type RuntimeRepoSparsePresetResult = { preset: RuntimeSparsePreset }
export type RuntimeRepoBaseRefDefaultResult = {
  defaultBaseRef: string | null
  remoteCount: number
}
export type RuntimeRepoSearchRefsResult = {
  refs: string[]
  refDetails?: BaseRefSearchResult[]
  truncated: boolean
}
