import type { RuntimeGitLocalBranches } from '@yiru/runtime-protocol/mobile-runtime-types'
import type { HostedReviewProvider } from '@yiru/workbench-model/review'
import type { CommitMessageDraftContext } from '~shared/commit-message/generation'
import { getCommitMessageModelDiscoveryHostKey } from '~shared/commit-message/host-key'
import type { GitHistoryOptions, GitHistoryResult } from '~shared/git/history'
import type {
  GitAddTagResult,
  GitCheckoutCommitResult,
  GitCherryPickResult,
  GitCreateBranchResult,
  GitDropCommitResult,
  GitMergeCommitResult,
  GitRebaseOntoCommitResult,
  GitResetToCommitResult,
  GitRevertResult
} from '~shared/git/write-op-results'
import type { RuntimeGitCheckoutResult } from '~shared/runtime-types'
import {
  mergeLegacyCommitMessageAiIntoSourceControlAi,
  type ResolvedSourceControlAiGenerationParams
} from '~shared/source-control/ai'
import type { SourceControlAiOperation } from '~shared/source-control/ai-types'
/* eslint-disable max-lines -- Why: runtime git dispatch stays in one boundary so native, WSL, and paired-runtime behavior remains comparable. */
import type {
  GitBranchCompareResult,
  GitCommitCompareResult,
  GitConflictOperation,
  GitDiffResult,
  GitForkSyncExpectedUpstream,
  GitForkSyncResult,
  GitPushTarget,
  GitStagingArea,
  GitStatusResult,
  GitUpstreamStatus,
  GitWorktreeInfo,
  GlobalSettings,
  Repo,
  TuiAgent,
  Worktree
} from '~shared/types'

import { createBranchFromCommit } from '../git/branch-create'
import { checkIgnoredPaths } from '../git/check-ignored-paths'
import { checkoutBranch, listLocalBranches } from '../git/checkout'
import { checkoutCommit } from '../git/checkout-commit'
import { cherryPickCommit } from '../git/cherry-pick'
import { dropCommit } from '../git/drop-commit'
import { gitSyncForkDefaultBranch } from '../git/fork-sync'
import { getHistory as getGitHistory } from '../git/history'
import { mergeCommit } from '../git/merge-commit'
import { rebaseOntoCommit } from '../git/rebase-onto-commit'
import { gitFastForward, gitFetch, gitPull, gitPullRebaseFromBase, gitPush } from '../git/remote'
import { getRemoteCommitUrl, getRemoteFileUrl } from '../git/repo'
import { resetToCommit } from '../git/reset-to-commit'
import { revertCommit } from '../git/revert'
import { gitExecFileAsync } from '../git/runner'
import type { GitRuntimeOptions } from '../git/runtime-options'
import {
  abortMerge,
  abortRebase,
  abortRevert,
  bulkDiscardChanges,
  bulkStageFiles,
  bulkUnstageFiles,
  commitChanges,
  detectConflictOperation,
  discardChanges,
  getBranchCompare,
  getBranchDiff,
  getCommitCompare,
  getCommitDiff,
  getDiff,
  getStagedCommitContext,
  getStatus as getGitStatus,
  getSubmoduleStatus as getGitSubmoduleStatus,
  stageFile,
  unstageFile
} from '../git/status'
import { addTag } from '../git/tag'
import { getUpstreamStatus } from '../git/upstream'
import type { GitProviderStatusOptions } from '../providers/git-provider-status-options'
import { resolveHostedReviewBodyForGeneration } from '../source-control/pull-request-template'
import type {
  CommitMessageAgentEnvironmentResolvers,
  CommitMessageAgentRuntimeTarget
} from '../text-generation/commit-message-agent-environment'
import { prepareLocalCommitMessageAgentEnv } from '../text-generation/commit-message-agent-environment'
import {
  cancelGenerateCommitMessageLocal,
  cancelGeneratePullRequestFieldsLocal,
  discoverCommitMessageModelsLocal,
  generateCommitMessageFromContext,
  generatePullRequestFieldsFromContext,
  resolveCommitMessageSettings,
  type CommitMessageGenerationTarget,
  type DiscoverCommitMessageModelsResult,
  type GenerateCommitMessageResult,
  type GeneratePullRequestFieldsResult
} from '../text-generation/commit-message-text-generation'
import { getPullRequestDraftContext } from '../text-generation/pull-request-context'
import { getWorktreeSharedLinkPaths } from '../worktree/shared-directories'
import { normalizeRuntimeRelativePath } from './relative-paths'

export type ResolvedRuntimeGitWorktree = Worktree & { git: GitWorktreeInfo }
type RuntimeCommitMessageSettingsOverride = Partial<
  Pick<
    GlobalSettings,
    'commitMessageAi' | 'sourceControlAi' | 'agentCmdOverrides' | 'enableGitHubAttribution'
  >
> & {
  commitMessageDiscoveryHostKey?: string
  sourceControlAiResolvedParams?: ResolvedSourceControlAiGenerationParams
}

type RuntimeGitMutationAdmission = {
  signal?: AbortSignal
  beforeSideEffect?: () => void | Promise<void>
}

async function admitRuntimeGitMutation(admission?: RuntimeGitMutationAdmission): Promise<void> {
  admission?.signal?.throwIfAborted()
  await admission?.beforeSideEffect?.()
  admission?.signal?.throwIfAborted()
}

function getRuntimeGitGenerationSettings(
  settings: GlobalSettings,
  settingsOverride: RuntimeCommitMessageSettingsOverride | undefined,
  operation: SourceControlAiOperation
): GlobalSettings {
  const mergedSettings = {
    ...settings,
    ...settingsOverride
  }
  if (
    settingsOverride?.commitMessageAi !== undefined &&
    settingsOverride.sourceControlAi === undefined
  ) {
    mergedSettings.sourceControlAi = mergeLegacyCommitMessageAiIntoSourceControlAi(
      settings.sourceControlAi,
      settingsOverride.commitMessageAi,
      { pullRequestInstructionsFromLegacy: operation === 'pullRequest' }
    )
  }
  return mergedSettings
}

function normalizeRuntimeGitRelativePath(filePath: string): string {
  const relativePath = normalizeRuntimeRelativePath(filePath)
  if (relativePath === '') {
    // Why: git mutation APIs treat an empty pathspec as the worktree root;
    // runtime RPC must never let malformed file paths discard whole worktrees.
    throw new Error('invalid_relative_path')
  }
  return relativePath
}

type RuntimeGitTarget = {
  worktree: ResolvedRuntimeGitWorktree
  repo?: Repo
  localGitOptions?: GitRuntimeOptions
}

function localGitOptionsForTarget(target: RuntimeGitTarget): GitRuntimeOptions {
  return target.localGitOptions ?? {}
}

function localAgentRuntimeTargetForTarget(
  target: RuntimeGitTarget
): CommitMessageAgentRuntimeTarget {
  const wslDistro = localGitOptionsForTarget(target).wslDistro
  return wslDistro ? { runtime: 'wsl', wslDistro } : { runtime: 'host' }
}

function localTextGenerationTargetForTarget(
  target: RuntimeGitTarget,
  env?: NodeJS.ProcessEnv
): Extract<CommitMessageGenerationTarget, { kind: 'local' }> {
  const wslDistro = localGitOptionsForTarget(target).wslDistro
  return {
    kind: 'local',
    cwd: target.worktree.path,
    ...(wslDistro ? { wslDistro } : {}),
    ...(env ? { env } : {})
  }
}

export type RuntimeGitCommandHost = {
  resolveRuntimeGitTarget(selector: string): Promise<RuntimeGitTarget>
  getRuntimeSettings(): GlobalSettings
  getCommitMessageAgentEnvironment?(): CommitMessageAgentEnvironmentResolvers | undefined
}

export class RuntimeGitCommands {
  constructor(private readonly host: RuntimeGitCommandHost) {}

  async getRuntimeGitStatus(
    worktreeSelector: string,
    options?: GitProviderStatusOptions
  ): Promise<GitStatusResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const gitOptions = localGitOptionsForTarget(target)
    const sharedLinkPaths = target.repo ? getWorktreeSharedLinkPaths(target.repo) : []
    const sharedOptions = sharedLinkPaths.length > 0 ? { sharedLinkPaths } : {}
    return options
      ? getGitStatus(target.worktree.path, { ...options, ...gitOptions, ...sharedOptions })
      : getGitStatus(target.worktree.path, { ...gitOptions, ...sharedOptions })
  }

  async getRuntimeGitSubmoduleStatus(
    worktreeSelector: string,
    submodulePath: string,
    area: GitStagingArea = 'unstaged'
  ): Promise<GitStatusResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return getGitSubmoduleStatus(target.worktree.path, submodulePath, {
      ...localGitOptionsForTarget(target),
      ...(area === 'staged' ? { staged: true } : {})
    })
  }

  async checkRuntimeGitIgnoredPaths(
    worktreeSelector: string,
    relativePaths: string[]
  ): Promise<string[]> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return checkIgnoredPaths(target.worktree.path, relativePaths, localGitOptionsForTarget(target))
  }

  async getRuntimeGitHistory(
    worktreeSelector: string,
    options: GitHistoryOptions = {}
  ): Promise<GitHistoryResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return getGitHistory(target.worktree.path, {
      ...options,
      ...localGitOptionsForTarget(target)
    })
  }

  async getRuntimeGitConflictOperation(worktreeSelector: string): Promise<GitConflictOperation> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return detectConflictOperation(target.worktree.path)
  }

  async abortRuntimeGitMerge(worktreeSelector: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await abortMerge(target.worktree.path, localGitOptionsForTarget(target))
    return { ok: true }
  }

  async abortRuntimeGitRebase(worktreeSelector: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await abortRebase(target.worktree.path, localGitOptionsForTarget(target))
    return { ok: true }
  }

  async checkoutRuntimeGitBranch(
    worktreeSelector: string,
    branch: string
  ): Promise<RuntimeGitCheckoutResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await checkoutBranch(target.worktree.path, branch, localGitOptionsForTarget(target))
    return { ok: true, branch }
  }

  async abortRuntimeGitRevert(worktreeSelector: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await abortRevert(target.worktree.path, localGitOptionsForTarget(target))
    return { ok: true }
  }

  async addRuntimeGitTag(
    worktreeSelector: string,
    params: { name: string; commit: string; message?: string; force?: boolean }
  ): Promise<GitAddTagResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return addTag(target.worktree.path, params, localGitOptionsForTarget(target))
  }

  async createRuntimeGitBranchFromCommit(
    worktreeSelector: string,
    params: { name: string; commit: string; checkout?: boolean }
  ): Promise<GitCreateBranchResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return createBranchFromCommit(target.worktree.path, params, localGitOptionsForTarget(target))
  }

  async checkoutRuntimeGitCommit(
    worktreeSelector: string,
    commit: string
  ): Promise<GitCheckoutCommitResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return checkoutCommit(target.worktree.path, commit, localGitOptionsForTarget(target))
  }

  async cherryPickRuntimeGitCommit(
    worktreeSelector: string,
    params: { commit: string; mainline?: number }
  ): Promise<GitCherryPickResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return cherryPickCommit(target.worktree.path, params, localGitOptionsForTarget(target))
  }

  async revertRuntimeGitCommit(
    worktreeSelector: string,
    params: { commit: string; mainline?: number }
  ): Promise<GitRevertResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return revertCommit(target.worktree.path, params, localGitOptionsForTarget(target))
  }

  async dropRuntimeGitCommit(
    worktreeSelector: string,
    params: { commit: string }
  ): Promise<GitDropCommitResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return dropCommit(target.worktree.path, params, localGitOptionsForTarget(target))
  }

  async mergeRuntimeGitCommit(
    worktreeSelector: string,
    params: { commit: string; noFf?: boolean; squash?: boolean; message?: string }
  ): Promise<GitMergeCommitResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return mergeCommit(target.worktree.path, params, localGitOptionsForTarget(target))
  }

  async rebaseRuntimeGitOntoCommit(
    worktreeSelector: string,
    params: { commit: string }
  ): Promise<GitRebaseOntoCommitResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return rebaseOntoCommit(target.worktree.path, params, localGitOptionsForTarget(target))
  }

  async resetRuntimeGitToCommit(
    worktreeSelector: string,
    params: { commit: string; mode: 'soft' | 'mixed' | 'hard' }
  ): Promise<GitResetToCommitResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return resetToCommit(target.worktree.path, params, localGitOptionsForTarget(target))
  }

  async listRuntimeGitLocalBranches(worktreeSelector: string): Promise<RuntimeGitLocalBranches> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return listLocalBranches(target.worktree.path, localGitOptionsForTarget(target))
  }

  async getRuntimeGitDiff(
    worktreeSelector: string,
    filePath: string,
    staged: boolean,
    compareAgainstHead?: boolean
  ): Promise<GitDiffResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativePath = normalizeRuntimeGitRelativePath(filePath)
    return getDiff(
      target.worktree.path,
      relativePath,
      staged,
      compareAgainstHead,
      localGitOptionsForTarget(target)
    )
  }

  async getRuntimeGitBranchCompare(
    worktreeSelector: string,
    baseRef: string
  ): Promise<GitBranchCompareResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return getBranchCompare(target.worktree.path, baseRef, localGitOptionsForTarget(target))
  }

  async getRuntimeGitCommitCompare(
    worktreeSelector: string,
    commitId: string
  ): Promise<GitCommitCompareResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return getCommitCompare(target.worktree.path, commitId, localGitOptionsForTarget(target))
  }

  async getRuntimeGitUpstreamStatus(
    worktreeSelector: string,
    pushTarget?: GitPushTarget
  ): Promise<GitUpstreamStatus> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return getUpstreamStatus(target.worktree.path, pushTarget, localGitOptionsForTarget(target))
  }

  async fetchRuntimeGit(
    worktreeSelector: string,
    pushTarget?: GitPushTarget
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await gitFetch(target.worktree.path, pushTarget, localGitOptionsForTarget(target))
    return { ok: true }
  }

  async syncRuntimeGitForkDefaultBranch(
    worktreeSelector: string,
    expectedUpstream: GitForkSyncExpectedUpstream
  ): Promise<GitForkSyncResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return gitSyncForkDefaultBranch(
      target.worktree.path,
      expectedUpstream,
      localGitOptionsForTarget(target)
    )
  }

  async pullRuntimeGit(
    worktreeSelector: string,
    pushTarget?: GitPushTarget
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await gitPull(target.worktree.path, pushTarget, localGitOptionsForTarget(target))
    return { ok: true }
  }

  async fastForwardRuntimeGit(
    worktreeSelector: string,
    pushTarget?: GitPushTarget
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await gitFastForward(target.worktree.path, pushTarget, localGitOptionsForTarget(target))
    return { ok: true }
  }

  async rebaseRuntimeGitFromBase(worktreeSelector: string, baseRef: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await gitPullRebaseFromBase(target.worktree.path, baseRef, localGitOptionsForTarget(target))
    return { ok: true }
  }

  async pushRuntimeGit(
    worktreeSelector: string,
    publish?: boolean,
    pushTarget?: GitPushTarget,
    forceWithLease?: boolean
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await gitPush(target.worktree.path, publish === true, pushTarget, {
      forceWithLease: forceWithLease === true,
      ...localGitOptionsForTarget(target)
    })
    return { ok: true }
  }

  async getRuntimeGitBranchDiff(
    worktreeSelector: string,
    compare: { mergeBase: string; headOid: string },
    filePath: string,
    oldPath?: string
  ): Promise<GitDiffResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativePath = normalizeRuntimeGitRelativePath(filePath)
    const oldRelativePath = oldPath ? normalizeRuntimeGitRelativePath(oldPath) : undefined
    return getBranchDiff(
      target.worktree.path,
      {
        mergeBase: compare.mergeBase,
        headOid: compare.headOid,
        filePath: relativePath,
        oldPath: oldRelativePath
      },
      localGitOptionsForTarget(target)
    )
  }

  async getRuntimeGitCommitDiff(
    worktreeSelector: string,
    args: { commitOid: string; parentOid?: string | null; filePath: string; oldPath?: string }
  ): Promise<GitDiffResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativePath = normalizeRuntimeRelativePath(args.filePath)
    const oldRelativePath = args.oldPath ? normalizeRuntimeRelativePath(args.oldPath) : undefined
    return getCommitDiff(
      target.worktree.path,
      {
        commitOid: args.commitOid,
        parentOid: args.parentOid,
        filePath: relativePath,
        oldPath: oldRelativePath
      },
      localGitOptionsForTarget(target)
    )
  }

  async commitRuntimeGit(
    worktreeSelector: string,
    message: string,
    admission?: RuntimeGitMutationAdmission
  ): Promise<{ success: boolean; error?: string }> {
    if (message.trim().length === 0) {
      throw new Error('Commit message is required')
    }
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    await admitRuntimeGitMutation(admission)
    return commitChanges(target.worktree.path, message, {
      ...localGitOptionsForTarget(target),
      signal: admission?.signal
    })
  }

  async generateRuntimeCommitMessage(
    worktreeSelector: string,
    settingsOverride?: RuntimeCommitMessageSettingsOverride
  ): Promise<GenerateCommitMessageResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const discoveryHostKey =
      settingsOverride?.commitMessageDiscoveryHostKey ?? getCommitMessageModelDiscoveryHostKey(null)
    const resolvedSettings = settingsOverride?.sourceControlAiResolvedParams
      ? { ok: true as const, params: settingsOverride.sourceControlAiResolvedParams }
      : resolveCommitMessageSettings(
          getRuntimeGitGenerationSettings(
            this.host.getRuntimeSettings(),
            settingsOverride,
            'commitMessage'
          ),
          discoveryHostKey,
          'commitMessage',
          target.repo ?? null
        )
    if (!resolvedSettings.ok) {
      return { success: false, error: resolvedSettings.error }
    }

    let context: CommitMessageDraftContext | null
    try {
      context = await getStagedCommitContext(target.worktree.path, localGitOptionsForTarget(target))
    } catch (error) {
      console.error('[runtime-git] Failed to read staged commit context:', error)
      return { success: false, error: 'Failed to read staged changes.' }
    }
    if (!context) {
      return { success: false, error: 'No staged changes to summarize.' }
    }
    const localEnv = await prepareLocalCommitMessageAgentEnv(
      resolvedSettings.params.agentId,
      this.host.getCommitMessageAgentEnvironment?.(),
      localAgentRuntimeTargetForTarget(target)
    )
    if (!localEnv.ok) {
      return { success: false, error: localEnv.error }
    }
    return generateCommitMessageFromContext(
      context,
      resolvedSettings.params,
      localTextGenerationTargetForTarget(target, localEnv.env)
    )
  }

  async cancelRuntimeGenerateCommitMessage(worktreeSelector: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    cancelGenerateCommitMessageLocal(target.worktree.path)
    return { ok: true }
  }

  async generateRuntimePullRequestFields(
    worktreeSelector: string,
    input: {
      base: string
      title: string
      body: string
      draft: boolean
      provider?: HostedReviewProvider
      useTemplate?: boolean
    },
    settingsOverride?: RuntimeCommitMessageSettingsOverride
  ): Promise<GeneratePullRequestFieldsResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const discoveryHostKey =
      settingsOverride?.commitMessageDiscoveryHostKey ?? getCommitMessageModelDiscoveryHostKey(null)
    const resolvedSettings = settingsOverride?.sourceControlAiResolvedParams
      ? { ok: true as const, params: settingsOverride.sourceControlAiResolvedParams }
      : resolveCommitMessageSettings(
          getRuntimeGitGenerationSettings(
            this.host.getRuntimeSettings(),
            settingsOverride,
            'pullRequest'
          ),
          discoveryHostKey,
          'pullRequest',
          target.repo ?? null
        )
    if (!resolvedSettings.ok) {
      return { success: false, error: resolvedSettings.error }
    }

    let context: Awaited<ReturnType<typeof getPullRequestDraftContext>>
    try {
      const currentBody = await resolveHostedReviewBodyForGeneration({
        body: input.body,
        repoPath: target.worktree.path,
        provider: input.provider,
        useTemplate: input.useTemplate
      })
      context = await getPullRequestDraftContext(
        (argv, options) =>
          gitExecFileAsync(argv, {
            cwd: target.worktree.path,
            ...localGitOptionsForTarget(target),
            ...options
          }),
        {
          base: input.base,
          currentTitle: input.title,
          currentBody,
          currentDraft: input.draft
        }
      )
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to prepare branch for PR details.'
      }
    }
    if (!context) {
      return { success: false, error: 'No branch changes to summarize.' }
    }

    const localEnv = await prepareLocalCommitMessageAgentEnv(
      resolvedSettings.params.agentId,
      this.host.getCommitMessageAgentEnvironment?.(),
      localAgentRuntimeTargetForTarget(target)
    )
    if (!localEnv.ok) {
      return { success: false, error: localEnv.error }
    }
    return generatePullRequestFieldsFromContext(
      context,
      resolvedSettings.params,
      localTextGenerationTargetForTarget(target, localEnv.env)
    )
  }

  async cancelRuntimeGeneratePullRequestFields(worktreeSelector: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    cancelGeneratePullRequestFieldsLocal(target.worktree.path)
    return { ok: true }
  }

  async discoverRuntimeCommitMessageModels(
    worktreeSelector: string,
    agentId: string,
    settingsOverride?: Pick<RuntimeCommitMessageSettingsOverride, 'agentCmdOverrides'>
  ): Promise<DiscoverCommitMessageModelsResult> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const typedAgentId = agentId as TuiAgent
    const agentCommandOverride =
      settingsOverride?.agentCmdOverrides?.[typedAgentId] ??
      this.host.getRuntimeSettings().agentCmdOverrides?.[typedAgentId]
    const localEnv = await prepareLocalCommitMessageAgentEnv(
      typedAgentId,
      this.host.getCommitMessageAgentEnvironment?.(),
      localAgentRuntimeTargetForTarget(target)
    )
    if (!localEnv.ok) {
      return { success: false, error: localEnv.error }
    }
    const localOptions = localGitOptionsForTarget(target)
    return localOptions.wslDistro
      ? discoverCommitMessageModelsLocal(typedAgentId, localEnv.env, agentCommandOverride, {
          cwd: target.worktree.path,
          wslDistro: localOptions.wslDistro
        })
      : discoverCommitMessageModelsLocal(typedAgentId, localEnv.env, agentCommandOverride)
  }

  async stageRuntimeGitPath(worktreeSelector: string, filePath: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativePath = normalizeRuntimeGitRelativePath(filePath)
    await stageFile(target.worktree.path, relativePath, localGitOptionsForTarget(target))
    return { ok: true }
  }

  async unstageRuntimeGitPath(worktreeSelector: string, filePath: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativePath = normalizeRuntimeGitRelativePath(filePath)
    await unstageFile(target.worktree.path, relativePath, localGitOptionsForTarget(target))
    return { ok: true }
  }

  async bulkStageRuntimeGitPaths(
    worktreeSelector: string,
    filePaths: string[],
    admission?: RuntimeGitMutationAdmission
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativePaths = filePaths.map((path) => normalizeRuntimeGitRelativePath(path))
    await admitRuntimeGitMutation(admission)
    await bulkStageFiles(target.worktree.path, relativePaths, {
      ...localGitOptionsForTarget(target),
      signal: admission?.signal
    })
    return { ok: true }
  }

  async bulkUnstageRuntimeGitPaths(
    worktreeSelector: string,
    filePaths: string[],
    admission?: RuntimeGitMutationAdmission
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativePaths = filePaths.map((path) => normalizeRuntimeGitRelativePath(path))
    await admitRuntimeGitMutation(admission)
    await bulkUnstageFiles(target.worktree.path, relativePaths, {
      ...localGitOptionsForTarget(target),
      signal: admission?.signal
    })
    return { ok: true }
  }

  async bulkDiscardRuntimeGitPaths(
    worktreeSelector: string,
    filePaths: string[]
  ): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativePaths = filePaths.map((path) => normalizeRuntimeGitRelativePath(path))
    await bulkDiscardChanges(target.worktree.path, relativePaths, localGitOptionsForTarget(target))
    return { ok: true }
  }

  async discardRuntimeGitPath(worktreeSelector: string, filePath: string): Promise<{ ok: true }> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const relativePath = normalizeRuntimeGitRelativePath(filePath)
    await discardChanges(target.worktree.path, relativePath, localGitOptionsForTarget(target))
    return { ok: true }
  }

  async getRuntimeGitRemoteFileUrl(
    worktreeSelector: string,
    relativePath: string,
    line: number
  ): Promise<string | null> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    const normalizedRelativePath = normalizeRuntimeGitRelativePath(relativePath)
    return getRemoteFileUrl(target.worktree.path, normalizedRelativePath, line)
  }

  async getRuntimeGitRemoteCommitUrl(
    worktreeSelector: string,
    sha: string
  ): Promise<string | null> {
    const target = await this.host.resolveRuntimeGitTarget(worktreeSelector)
    return getRemoteCommitUrl(target.worktree.path, sha)
  }
}
