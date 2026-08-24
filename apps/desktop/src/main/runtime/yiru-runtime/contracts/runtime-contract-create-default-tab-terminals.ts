import type {
  CreateWorktreeResult,
  GitPushTarget,
  WorktreeMeta,
  WorktreeBaseStatusEvent,
  WorktreeRemoteBranchConflictEvent,
  WorktreeStartupLaunch,
  TuiAgent,
  WorkspaceCreateTelemetrySource
} from '~shared/types'

import type { RemoteFetchResult, RemoteTrackingBase } from '../model/runtime-store'
import type { WorktreeStartupDraftPaste } from '../model/terminal-startup'
import type { WorktreeLineageInput } from '../model/worktree-resolution'
import { RuntimeContractMergeRepoPR } from './runtime-contract-merge-repo-pr'

export abstract class RuntimeContractCreateDefaultTabTerminals extends RuntimeContractMergeRepoPR {
  protected abstract createDefaultTabTerminals(
    worktreeSelector: string,
    worktreeId: string,
    defaultTabs: CreateWorktreeResult['defaultTabs'] | undefined
  ): Promise<string[]>

  protected abstract provisionManagedWorktreeTerminals(args: {
    worktreeSelector: string
    worktreeId: string
    worktreePath: string
    setup?: CreateWorktreeResult['setup']
    defaultTabs?: CreateWorktreeResult['defaultTabs']
    primaryTerminalHandle?: string | null
    hasStartupTerminal: boolean
    setupCommandPlatform: 'windows' | 'posix'
    observeSetupCompletion?: boolean
    // Why: when the agent startup is sequenced to wait for setup
    // (waitForAgentStartup), the startup PTY runs a wrapper that already embeds
    // the setup command. Pass that wrapped command through so the Setup tab runs
    // the same script the agent is waiting on instead of a bare runner.
    wrappedSetupCommand?: string
  }): Promise<{ setupSpawned: boolean; setupTerminalHandle: string | null }>

  abstract waitForSetupTerminalCompletion(handle: string): Promise<{ exitCode: number | null }>

  protected abstract waitForStartupFollowupReady(
    handle: string,
    expectedProcess: string
  ): Promise<string | null>

  protected abstract waitForStartupDraftReady(
    handle: string,
    agent: TuiAgent
  ): Promise<string | null>

  abstract prefetchManagedWorktreeCreateBase(args: {
    repoSelector: string
    baseBranch?: string
  }): Promise<void>

  abstract createManagedWorktree(args: {
    repoSelector: string
    name: string
    baseBranch?: string
    compareBaseRef?: string
    branchNameOverride?: string
    linkedPR?: number | null
    linkedGitLabMR?: number | null
    linkedBitbucketPR?: number | null
    linkedAzureDevOpsPR?: number | null
    linkedGiteaPR?: number | null
    comment?: string
    displayName?: string
    telemetrySource?: WorkspaceCreateTelemetrySource
    workspaceStatus?: string
    manualOrder?: number
    sparseCheckout?: { directories: string[]; presetId?: string }
    pushTarget?: GitPushTarget
    runHooks?: boolean
    activate?: boolean
    setupDecision?: 'run' | 'skip' | 'inherit'
    awaitTerminalProvisioning?: boolean
    observeSetupCompletion?: boolean
    createdWithAgent?: TuiAgent
    startupAgent?: TuiAgent
    startupPrompt?: string
    pendingFirstAgentMessageRename?: boolean
    startup?: WorktreeStartupLaunch
    startupDraft?: string
    startupDraftPaste?: WorktreeStartupDraftPaste
    lineage?: WorktreeLineageInput
  }): Promise<CreateWorktreeResult>

  abstract getCanonicalFetchKey(
    repoPath: string,
    remote: string,
    gitOptions?: { wslDistro?: string }
  ): Promise<string>

  protected abstract enqueueRemoteFetch(
    remoteKey: string,
    runFetch: () => Promise<RemoteFetchResult>
  ): Promise<RemoteFetchResult>

  protected abstract getFreshFetchCompletedAt(key: string): number | null

  protected abstract rememberFreshFetchCompletedAt(key: string, completedAt?: number): void

  abstract getOrStartRemoteFetch(
    repoPath: string,
    remote: string,
    gitOptions?: { wslDistro?: string }
  ): Promise<RemoteFetchResult>

  abstract getOrStartRemoteTrackingBaseRefresh(
    repoPath: string,
    base: RemoteTrackingBase,
    gitOptions?: { wslDistro?: string }
  ): Promise<RemoteFetchResult>

  abstract fetchRemoteWithCache(
    repoPath: string,
    remote: string,
    gitOptions?: { wslDistro?: string }
  ): Promise<void>

  abstract resolveRemoteTrackingBase(
    repoPath: string,
    baseBranch: string,
    gitOptions?: { wslDistro?: string }
  ): Promise<RemoteTrackingBase | null>

  abstract hasRemoteTrackingRef(
    repoPath: string,
    base: RemoteTrackingBase,
    gitOptions?: { wslDistro?: string }
  ): Promise<boolean>

  abstract recordOptimisticReconcileToken(worktreeId: string): string

  abstract clearOptimisticReconcileToken(worktreeId: string): void

  abstract emitWorktreeBaseStatus(event: WorktreeBaseStatusEvent): void

  abstract emitWorktreeRemoteBranchConflict(event: WorktreeRemoteBranchConflictEvent): void

  abstract reconcileWorktreeBaseStatus(args: {
    repoId: string
    repoPath: string
    worktreeId: string
    base: RemoteTrackingBase
    branchName: string
    createdBaseSha: string
    token: string
    fetchPromise: Promise<RemoteFetchResult>
  }): Promise<void>

  abstract probeWorktreeDrift(worktreeSelector: string): Promise<{
    base: string
    behind: number
    recentSubjects: string[]
  } | null>

  abstract updateManagedWorktreeMeta(
    worktreeSelector: string,
    updates: Omit<Partial<WorktreeMeta>, 'pushTarget'> & {
      pushTarget?: GitPushTarget | null
      lineage?: {
        parentWorktree?: string
        noParent?: boolean
      }
    }
  )

  abstract persistManagedWorktreeSortOrder(
    orderedIds: string[],
    options?: { notifyClients?: boolean }
  ): { updated: number }
}
