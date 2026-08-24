import type { RuntimeRepoHooksCheckResult } from '@yiru/runtime-protocol/contract'
import type { ExecutionHostId } from '@yiru/workbench-model/workspace'
import type {
  mergePR,
  setPRAutoMerge,
  updatePRState,
  requestPRReviewers,
  removePRReviewers,
  addPullRequestComment,
  addPRReviewComment,
  addPRReviewCommentReply
} from '~main/github/client'
import type { Store } from '~main/persistence'
import type {
  CoworkingPairedRuntimeResolvedWorktree,
  CoworkingPairedRuntimeWorktreeSelector
} from '~shared/coworking/paired-runtime-host-contract'
import type { RuntimeWorktreeListResult } from '~shared/runtime-types'
import type {
  DetectedWorktree,
  DetectedWorktreeListResult,
  GitHubOwnerRepo,
  Repo,
  Worktree,
  WorktreeLineage,
  WorkspaceLineage,
  WorktreeLineageWarning,
  WorktreeStartupLaunch,
  TuiAgent
} from '~shared/types'
import type { GitHubPullRequestStateUpdate, GitHubPRReviewCommentInput } from '~shared/types'
import type {
  WorkspacePortKillRequest,
  WorkspacePortKillResult,
  WorkspacePortProbe,
  WorkspacePortScanResult
} from '~shared/workspace/ports'

import type { WorktreeStartupDraftPaste, WorktreeStartupFollowup } from '../model/terminal-startup'
import type { WorktreeLineageResolution } from '../model/worktree-resolution'
import { RuntimeContractResolveGitLabRepoMRDiscussion } from './runtime-contract-resolve-git-lab-repo-mrdiscussion'

export abstract class RuntimeContractMergeRepoPR extends RuntimeContractResolveGitLabRepoMRDiscussion {
  abstract mergeRepoPR(
    repoSelector: string,
    prNumber: number,
    method?: 'merge' | 'squash' | 'rebase',
    prRepo?: GitHubOwnerRepo | null
  ): Promise<Awaited<ReturnType<typeof mergePR>>>

  abstract setRepoPRAutoMerge(
    repoSelector: string,
    prNumber: number,
    enabled: boolean,
    method?: 'merge' | 'squash' | 'rebase',
    prRepo?: GitHubOwnerRepo | null
  ): Promise<Awaited<ReturnType<typeof setPRAutoMerge>>>

  abstract updateRepoPRState(
    repoSelector: string,
    prNumber: number,
    updates: GitHubPullRequestStateUpdate
  ): Promise<Awaited<ReturnType<typeof updatePRState>>>

  abstract requestRepoPRReviewers(
    repoSelector: string,
    prNumber: number,
    reviewers: string[]
  ): Promise<Awaited<ReturnType<typeof requestPRReviewers>>>

  abstract removeRepoPRReviewers(
    repoSelector: string,
    prNumber: number,
    reviewers: string[]
  ): Promise<Awaited<ReturnType<typeof removePRReviewers>>>

  abstract addRepoPRComment(
    repoSelector: string,
    number: number,
    body: string,
    prRepo?: GitHubOwnerRepo | null
  ): Promise<Awaited<ReturnType<typeof addPullRequestComment>>>

  abstract addRepoPRReviewComment(
    repoSelector: string,
    args: Omit<GitHubPRReviewCommentInput, 'repoPath'>
  ): Promise<Awaited<ReturnType<typeof addPRReviewComment>>>

  abstract addRepoPRReviewCommentReply(
    repoSelector: string,
    args: {
      prNumber: number
      commentId: number
      body: string
      threadId?: string
      path?: string
      line?: number
      prRepo?: GitHubOwnerRepo | null
    }
  ): Promise<Awaited<ReturnType<typeof addPRReviewCommentReply>>>

  protected abstract getSetupHookTrustPayload(
    repo: Repo,
    scriptContentValue: string | undefined
  ): { contentHash: string; scriptContent: string } | undefined

  protected abstract getSharedSetupHookTrustPayload(
    repo: Repo,
    sharedSetupScript: string | undefined
  ): { contentHash: string; scriptContent: string } | undefined

  abstract getRepoHooks(repoSelector: string)

  abstract checkRepoHooks(
    repoSelector: string,
    hostId?: ExecutionHostId
  ): Promise<RuntimeRepoHooksCheckResult>

  abstract inspectRepoSetupScriptImports(repoSelector: string)

  abstract listManagedWorktrees(
    repoSelector?: string,
    limit?: number
  ): Promise<RuntimeWorktreeListResult>

  abstract listDetectedManagedWorktrees(repoSelector: string): Promise<DetectedWorktreeListResult>

  protected abstract isRuntimeWorktreeVisible(worktree: Worktree): boolean

  protected abstract toRuntimeDetectedWorktree(repo: Repo, worktree: Worktree): DetectedWorktree

  abstract showManagedWorktree(worktreeSelector: string)

  abstract resolvePairedRuntimeCoworkingWorktree(
    selector: CoworkingPairedRuntimeWorktreeSelector
  ): Promise<CoworkingPairedRuntimeResolvedWorktree>

  abstract getPairedRuntimeCoworkingStore(): Store

  abstract scanWorkspacePorts(repoId?: string): Promise<WorkspacePortScanResult>

  abstract killWorkspacePort(args: WorkspacePortKillRequest): Promise<WorkspacePortKillResult>

  protected abstract getWorkspacePortProbes(repoId?: string): Promise<WorkspacePortProbe[]>

  abstract sleepManagedWorktree(worktreeSelector: string): Promise<{ worktreeId: string }>

  abstract activateManagedWorktree(
    worktreeSelector: string,
    opts?: { notifyClients?: boolean; clientKind?: 'mobile' | 'runtime' }
  ): Promise<{
    repoId: string
    worktreeId: string
    activated: boolean
    /** Mobile-scoped slept-agent wake outcome. `unsupported-headless` means no
     *  renderer holds the sleeping records (headless `yiru serve`), so nothing
     *  woke — clients must not present the worktree's agents as resumed. */
    sleepingAgentWake: 'requested' | 'unsupported-headless' | 'not-applicable'
  }>

  protected abstract buildStartupForDraft(
    repo: Repo,
    draft: string,
    requestedAgent?: TuiAgent
  ): Promise<{
    agent: TuiAgent
    startup: WorktreeStartupLaunch
    draftPaste?: WorktreeStartupDraftPaste
  } | null>

  protected abstract buildStartupForAgent(
    repo: Repo,
    agent: TuiAgent,
    prompt: string | undefined
  ): { agent: TuiAgent; startup: WorktreeStartupLaunch; followup?: WorktreeStartupFollowup }

  protected abstract markLocalWorkspaceTrustedForAgent(agent: TuiAgent, workspacePath: string): void

  protected abstract recordCreatedWorktreeLineage(
    worktree: Pick<Worktree, 'id' | 'instanceId'>,
    lineageResolution: WorktreeLineageResolution
  ): {
    lineage: WorktreeLineage | null
    workspaceLineage: WorkspaceLineage | null
    warnings: WorktreeLineageWarning[]
  }

  protected abstract pasteStartupDraftWhenReady(
    handle: string,
    draft: WorktreeStartupDraftPaste
  ): void

  protected abstract sendStartupFollowupWhenReady(
    handle: string,
    followup: WorktreeStartupFollowup
  ): void
}
