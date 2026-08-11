import type { RepoHostAdapter } from '@yiru/shared/preload/api-types'
import type { ExecutionHostId } from '@yiru/workbench-model/workspace'
import type {
  CreateWorktreeArgs,
  CreateWorktreeResult,
  DetectedWorktreeListResult,
  ForceDeleteWorktreeBranchResult,
  GitHubPrStartPoint,
  GitPushTarget,
  RemoveWorktreeResult,
  Repo,
  Worktree,
  WorktreeBaseStatusEvent,
  WorktreeHeadIdentity,
  WorktreeLineage,
  WorktreeMeta,
  WorktreeRemoteBranchConflictEvent,
  WorkspaceLineage
} from '~shared/types'

export type RepoWorkspaceApi = RepoHostAdapter & {
  list: () => Promise<Repo[]>
  add: (args: {
    path: string
    kind?: 'git' | 'folder'
  }) => Promise<{ repo: Repo } | { error: string }>
  create: (args: {
    parentPath: string
    name: string
    kind: 'git' | 'folder'
  }) => Promise<{ repo: Repo } | { error: string }>
  isGitAvailable: () => Promise<boolean>
  remove: (args: { repoId: string }) => Promise<void>
  update: (args: {
    repoId: string
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
        | 'forgeRemotePreference'
        | 'externalWorktreeVisibility'
        | 'externalWorktreeVisibilityPromptDismissedAt'
        | 'externalWorktreeInboxBaselinePaths'
        | 'importedExternalWorktreePaths'
        | 'projectGroupId'
        | 'projectGroupOrder'
        | 'forkSyncMode'
      >
    > & {
      sourceControlAi?: Repo['sourceControlAi'] | null
      externalWorktreeDiscoverySuppressedAt?: Repo['externalWorktreeDiscoverySuppressedAt'] | null
    }
  }) => Promise<Repo>
  clone: (args: { url: string; destination: string }) => Promise<Repo>
  onCloneProgress: (callback: (data: { phase: string; percent: number }) => void) => () => void
  onChanged: (callback: () => void) => () => void
}

export type WorktreeWorkspaceApi = {
  list: (args: { repoId: string }) => Promise<Worktree[]>
  listDetected: (args: { repoId: string }) => Promise<DetectedWorktreeListResult>
  create: (args: CreateWorktreeArgs) => Promise<CreateWorktreeResult>
  onCreateProgress: (
    callback: (data: { creationId?: string; phase: 'fetching' | 'creating' }) => void
  ) => () => void
  prefetchCreateBase: (args: { repoId: string; baseBranch?: string }) => Promise<void>
  resolvePrBase: (args: {
    repoId: string
    prNumber: number
    headRefName?: string
    baseRefName?: string
    isCrossRepository?: boolean
  }) => Promise<GitHubPrStartPoint | { error: string }>
  resolveMrBase: (args: {
    repoId: string
    mrIid: number
    sourceBranch?: string
    targetBranch?: string
    isCrossRepository?: boolean
  }) => Promise<
    { baseBranch: string; compareBaseRef?: string; pushTarget?: GitPushTarget } | { error: string }
  >
  remove: (args: {
    worktreeId: string
    hostId?: ExecutionHostId
    force?: boolean
    skipArchive?: boolean
  }) => Promise<RemoveWorktreeResult>
  forceDeletePreservedBranch: (args: {
    worktreeId: string
    branchName: string
    expectedHead: string
  }) => Promise<ForceDeleteWorktreeBranchResult>
  updateMeta: (args: { worktreeId: string; updates: Partial<WorktreeMeta> }) => Promise<Worktree>
  listLineage: () => Promise<{
    lineage: Record<string, WorktreeLineage>
    workspaceLineage?: Record<string, WorkspaceLineage>
  }>
  persistSortOrder: (args: { orderedIds: string[] }) => Promise<void>
  onChanged: (
    callback: (data: {
      repoId: string
      renamed?: { oldWorktreeId: string; newWorktreeId: string }
    }) => void
  ) => () => void
  onGitStatusMetadataChanged: (callback: (data: { repoId: string }) => void) => () => void
  onHeadIdentitiesChanged: (
    callback: (data: { repoId: string; identities: WorktreeHeadIdentity[] }) => void
  ) => () => void
  onBaseStatus: (callback: (data: WorktreeBaseStatusEvent) => void) => () => void
  onRemoteBranchConflict: (
    callback: (data: WorktreeRemoteBranchConflictEvent) => void
  ) => () => void
}
