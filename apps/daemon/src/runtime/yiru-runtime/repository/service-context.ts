import type {
  RuntimeHostProgressEvent,
  RuntimeNestedRepoScanProgressEvent
} from '@yiru/runtime-protocol/contract'
import type { ExecutionHostId } from '@yiru/runtime-protocol/model/workspace'
import type { RuntimeWorkspaceOpenPathResult } from '@yiru/runtime-protocol/workbench/runtime-types'
import type {
  Project,
  ProjectHostSetup,
  ProjectHostSetupExistingFolderArgs,
  ProjectHostSetupResult,
  Repo,
  Worktree
} from '@yiru/runtime-protocol/workbench/types'
import type { WorkspaceCleanupScanProgress } from '@yiru/runtime-protocol/workbench/workspace/cleanup'
import type { WorkspaceSpaceScanProgress } from '@yiru/runtime-protocol/workbench/workspace/space-types'
import type { gitSpawn } from '~main/git/runner/runner'
import type { Store } from '~main/persistence/store'
import type { StatsCollector } from '~main/stats/collector'

import type { RuntimeContractMergeRepoPR } from '../contracts/runtime-contract-merge-repo-pr'
import type { RuntimePtyController } from '../model/terminal-observation'
import type { TerminalWorkspaceLaunchScope } from '../model/worktree-resolution'
import type { ResolvedWorktree } from '../model/worktree-resolution'

export type RepositoryServiceDeps = {
  activateManagedWorktree: RuntimeContractMergeRepoPR['activateManagedWorktree']
  assertGraphReady: () => void
  emitHostProgressEvent: (event: RuntimeHostProgressEvent) => void
  emitNestedRepoScanProgressEvent: (event: RuntimeNestedRepoScanProgressEvent) => void
  emitWorkspaceCleanupScanProgressEvent: (event: WorkspaceCleanupScanProgress) => void
  emitWorkspaceSpaceScanProgressEvent: (event: WorkspaceSpaceScanProgress) => void
  invalidateResolvedWorktreeCache: () => void
  listResolvedWorktrees: () => Promise<ResolvedWorktree[]>
  notifyReposChanged: () => void
  notifyWorktreesChanged: (repoId: string) => void
  ptyController: RuntimePtyController | null
  resolveLeafForHandle: (handle: string) => { ptyId: string | null } | null
  resolveRepoSelector: (selector: string, hostId?: ExecutionHostId) => Promise<Repo>
  resolveWorktreeSelector: (selector: string) => Promise<ResolvedWorktree>
  stats: StatsCollector | null
  store: Store
  toRuntimeDetectedWorktree: (
    repo: Repo,
    worktree: Worktree
  ) => ReturnType<RuntimeContractMergeRepoPR['toRuntimeDetectedWorktree']>
}

type RepositoryServiceState = {
  activeRepoClone: ReturnType<typeof gitSpawn> | null
  cloneInFlightByPath: Map<string, Promise<void>>
  workspacePathOpenTail: Promise<void>
}

type RepositoryInternalMethods = {
  activateWorkspacePathTarget: (
    requestedPath: string,
    worktree: ResolvedWorktree,
    disposition: RuntimeWorkspaceOpenPathResult['disposition']
  ) => Promise<RuntimeWorkspaceOpenPathResult>
  addRepo: RuntimeContractMergeRepoPR['addRepo']
  cloneRepo: RuntimeContractMergeRepoPR['cloneRepo']
  cloneRepoAfterPathLock: (
    trimmedUrl: string,
    trimmedDestination: string,
    clonePath: string,
    clonePathKey: string,
    executionHostId?: ExecutionHostId | null
  ) => Promise<Repo>
  getAgentLaunchPlatformForRepo: (repo: Repo) => NodeJS.Platform
  getAgentLaunchPlatformForWorkspace: (scope: TerminalWorkspaceLaunchScope) => NodeJS.Platform
  getHostedReviewExecutionOptions: (
    repo: Repo
  ) => { localGitExecOptions: { wslDistro?: string } } | undefined
  getLocalGitExecutionOptionArgs: (repo: Repo) => [] | [{ wslDistro?: string }]
  getRepoPRForBranchOutcome: RuntimeContractMergeRepoPR['getRepoPRForBranchOutcome']
  listProjectHostSetups: () => ProjectHostSetup[]
  listProjects: () => Project[]
  openWorkspacePathNow: (
    path: string,
    contextWorktree?: string
  ) => Promise<RuntimeWorkspaceOpenPathResult>
  resolveHostedReviewTarget: (args: {
    repoSelector: string
    worktreeSelector?: string
  }) => Promise<{ repo: Repo; repoPath: string }>
  setupProjectExistingFolder: (
    args: ProjectHostSetupExistingFolderArgs
  ) => Promise<ProjectHostSetupResult>
}

export type RepositoryServiceContext = RepositoryServiceDeps &
  RepositoryServiceState &
  RepositoryInternalMethods
