import type { HostedReviewProvider } from '@yiru/workbench-model/review'
import { gitExecFileAsync } from '~main/git/runner'
import { getStagedCommitContext } from '~main/git/status'
import { resolveHostedReviewBodyForGeneration } from '~main/source-control/pull-request-template'
import { prepareLocalCommitMessageAgentEnv } from '~main/text-generation/commit-message-agent-environment'
import {
  cancelGenerateCommitMessageLocal,
  cancelGeneratePullRequestFieldsLocal,
  discoverCommitMessageModelsLocal,
  generateCommitMessageFromContext,
  generatePullRequestFieldsFromContext,
  resolveCommitMessageSettings,
  type DiscoverCommitMessageModelsResult,
  type GenerateCommitMessageResult,
  type GeneratePullRequestFieldsResult
} from '~main/text-generation/commit-message-text-generation'
import { getPullRequestDraftContext } from '~main/text-generation/pull-request-context'
import type { CommitMessageDraftContext } from '~shared/commit-message/generation'
import { getCommitMessageModelDiscoveryHostKey } from '~shared/commit-message/host-key'
import type { TuiAgent } from '~shared/types'

import {
  generationRepoForTarget,
  getRuntimeGitGenerationSettings,
  localAgentRuntimeTargetForTarget,
  localGitOptionsForTarget,
  localTextGenerationTargetForTarget,
  type RuntimeCommitMessageSettingsOverride
} from './context'
import { RuntimeGitRemoteCommands } from './remote'

export class RuntimeGitGenerationCommands extends RuntimeGitRemoteCommands {
  async generateRuntimeCommitMessage(
    worktreeSelector: string,
    settingsOverride?: RuntimeCommitMessageSettingsOverride,
    repoId?: string
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
          generationRepoForTarget(target, repoId)
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
    settingsOverride?: RuntimeCommitMessageSettingsOverride,
    repoId?: string
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
          generationRepoForTarget(target, repoId)
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
}
