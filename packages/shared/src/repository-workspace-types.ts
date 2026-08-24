import type { RepoIcon } from '@yiru/workbench-model/workspace'

import type { ForkSyncMode } from './git/fork-sync'
import type { GitRemoteIdentity } from './git/remote-identity'
import type { GitHubRepositoryIdentity } from './github-review-types'
import type {
  ExternalWorktreeVisibility,
  ForgeRemotePreference,
  RepoKind,
  RepoProjectHostSetupMethod
} from './project-types'
import type { TuiAgent } from './settings-foundation-types'
import type { RepoSourceControlAiOverrides } from './source-control/ai-types'
import type { RepoHookSettings } from './worktree-operation-types'
import type { WorkspaceStatus } from './worktree-types'

export type Repo = {
  id: string
  path: string
  displayName: string
  badgeColor: string
  repoIcon?: RepoIcon | null
  /** Set when the repo is a fork: the upstream/parent owner/repo. Drives the
   *  default avatar (upstream owner, not the personal fork) and the fork
   *  indicator. Absent = not a fork, or fork status not yet resolved. */
  upstream?: GitHubRepositoryIdentity | null
  addedAt: number
  kind?: RepoKind
  gitUsername?: string
  worktreeBaseRef?: string
  /** Optional repo-scoped workspace root override. Relative paths resolve from `path`. */
  worktreeBasePath?: string
  hookSettings?: RepoHookSettings
  /** Why: preserve the legacy remote-host id so persisted repos decode without loss;
   *  nothing sets it since remote hosts were removed.
   */
  connectionId?: string | null
  /**
   * Explicit execution owner for this repo. Runtime-host repos need this
   * because they otherwise look identical to local repos (`connectionId: null`).
   */
  executionHostId?: 'local' | `runtime:${string}` | null
  /** Per-repo override for issue-source resolution. `undefined` is treated
   *  identically to `'auto'`; writers leave it undefined on creation so
   *  existing persisted records stay forward-compatible. */
  forgeRemotePreference?: ForgeRemotePreference
  /** Controls Yiru's fork-default-branch sync offer for repos with upstream metadata. */
  forkSyncMode?: ForkSyncMode
  /** Canonical identity for the repo remote Yiru should use for provider-level grouping. */
  gitRemoteIdentity?: GitRemoteIdentity | null
  /** Controls whether worktrees Yiru did not create appear in the sidebar. */
  externalWorktreeVisibility?: ExternalWorktreeVisibility
  /** True when the repo predates hidden-by-default external worktrees. */
  externalWorktreeVisibilityLegacy?: boolean
  /** One-shot guard for the optional existing-user visibility prompt. */
  externalWorktreeVisibilityPromptDismissedAt?: number
  /** Hidden external worktree paths acknowledged by Keep hidden on the inbox. */
  externalWorktreeInboxBaselinePaths?: string[]
  /** External worktree paths explicitly imported while global visibility stays hide. */
  importedExternalWorktreePaths?: string[]
  /** User permanently opted out of the new-external-worktree inbox for this repo. */
  externalWorktreeDiscoverySuppressedAt?: number
  /** Paths (relative to the primary checkout) that should be APFS clone-copied
   *  on macOS when possible, otherwise symlinked, into newly created worktrees.
   *  Undefined/empty means no shared paths are created for this repo. */
  symlinkPaths?: string[]
  /** Durable sidebar-only repo organization. Execution remains repo-scoped. */
  projectGroupId?: string | null
  /** User-authored ordering inside the project group or ungrouped bucket. */
  projectGroupOrder?: number
  /** Repo-specific source-control AI overrides. Missing fields inherit global settings. */
  sourceControlAi?: RepoSourceControlAiOverrides
  /** Transitional source for ProjectHostSetup.setupMethod while Repo remains compatibility storage. */
  projectHostSetupMethod?: RepoProjectHostSetupMethod
}

export type ProjectGroupCreatedFrom = 'manual' | 'folder-scan' | 'migration'

export type ProjectGroup = {
  id: string
  name: string
  parentPath: string | null
  /** SSH target ID for folder-backed groups imported from a remote root. */
  connectionId?: string | null
  /** Renderer-owned host stamp for groups fetched from a runtime environment. */
  executionHostId?: string | null
  parentGroupId: string | null
  createdFrom: ProjectGroupCreatedFrom
  tabOrder: number
  isCollapsed: boolean
  color: string | null
  createdAt: number
  updatedAt: number
}

export type WorkspaceScope =
  | { type: 'worktree'; worktreeId: string }
  | { type: 'folder'; folderWorkspaceId: string }

export type WorkspaceKey = `worktree:${string}` | `folder:${string}`

export type FolderWorkspace = {
  id: string
  projectGroupId: string
  name: string
  folderPath: string
  /** SSH target ID for folder workspaces whose folder path lives remotely. */
  connectionId?: string | null
  linkedReview: FolderWorkspaceLinkedReview | null
  comment: string
  isArchived: boolean
  isUnread: boolean
  isPinned: boolean
  sortOrder: number
  /** User-authored sidebar ordering. Higher values render earlier in Manual sort. */
  manualOrder?: number
  workspaceStatus?: WorkspaceStatus
  createdWithAgent?: TuiAgent
  pendingFirstAgentMessageRename?: boolean
  firstAgentMessageRenameError?: string | null
  lastActivityAt: number
  createdAt: number
  updatedAt: number
}

export type FolderWorkspaceLinkedReview = {
  provider: 'github' | 'gitlab'
  type: 'pr' | 'mr'
  number: number
  title: string
  url: string
  repoId?: string
}

export type NestedRepoScanOptions = {
  maxDepth?: number
  maxRepos?: number
  timeoutMs?: number | null
}

export type NestedRepoCandidate = {
  path: string
  displayName: string
  depth: number
}

export type NestedRepoScanResult = {
  selectedPath: string
  selectedPathKind: 'git_repo' | 'non_git_folder'
  repos: NestedRepoCandidate[]
  truncated: boolean
  timedOut: boolean
  stopped: boolean
  durationMs: number
  maxDepth: number
  maxRepos: number
  timeoutMs: number | null
}

export type ProjectGroupImportMode = 'group' | 'separate'

export type ProjectGroupImportProjectResult = {
  path: string
  projectId?: string
  status: 'imported' | 'already-known' | 'failed'
  error?: string
}

export type ProjectGroupImportResult = {
  group?: ProjectGroup
  projects: ProjectGroupImportProjectResult[]
  importedCount: number
  alreadyKnownCount: number
  failedCount: number
}
