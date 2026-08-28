import {
  GitGenerateCommitMessageInputSchema,
  GitGeneratePullRequestFieldsInputSchema
} from '@yiru/runtime-protocol/contract'
import type { HostedReviewProvider } from '@yiru/runtime-protocol/model/review'
import { getRepoIdFromWorktreeId } from '@yiru/runtime-protocol/model/workspace'
import type {
  CommitMessageAgentCapability,
  CommitMessageModelCapability
} from '@yiru/runtime-protocol/workbench/commit-message/agent-spec'
import { getCommitMessageModelDiscoveryHostKeyForScope } from '@yiru/runtime-protocol/workbench/commit-message/host-key'
import type { ResolvedSourceControlAiGenerationParams } from '@yiru/runtime-protocol/workbench/source-control/ai'
import type { GlobalSettings } from '@yiru/runtime-protocol/workbench/types'

import { callRuntimeOrpc } from '../orpc-client'
import {
  getRuntimeGitScope,
  getRuntimeGitTarget,
  getRuntimeGitWorktree,
  type RuntimeGitContext,
  type RuntimeGitSettings
} from './context'

export type RuntimeGenerateCommitMessageResult =
  | { success: true; message: string; agentLabel?: string }
  | { success: false; error: string; canceled?: boolean }

export type RuntimeGeneratePullRequestFieldsResult =
  | {
      success: true
      fields: { base: string; title: string; body: string; draft: boolean }
      agentLabel?: string
      branchChangedByPreparation?: boolean
    }
  | { success: false; error: string; canceled?: boolean; branchChangedByPreparation?: boolean }

export type RuntimePullRequestGenerationInput = {
  base: string
  title: string
  body: string
  draft: boolean
  provider?: HostedReviewProvider
  useTemplate?: boolean
}

type RuntimeDiscoverCommitMessageModelsResult =
  | {
      success: true
      capability: CommitMessageAgentCapability
      models: CommitMessageModelCapability[]
      defaultModelId: string
    }
  | { success: false; error: string }

export type RuntimeGenerateCommitMessageOverrides = {
  sourceControlAiResolvedParams?: ResolvedSourceControlAiGenerationParams
  sourceControlAi?: GlobalSettings['sourceControlAi']
  agentCmdOverrides?: GlobalSettings['agentCmdOverrides']
}

export type RuntimeGeneratePullRequestFieldsOverrides = RuntimeGenerateCommitMessageOverrides

function getRuntimeCommitMessageSettings(
  settings: RuntimeGitSettings | null | undefined,
  connectionId?: string
): Partial<
  Pick<
    GlobalSettings,
    'commitMessageAi' | 'sourceControlAi' | 'agentCmdOverrides' | 'enableGitHubAttribution'
  >
> & { commitMessageDiscoveryHostKey?: string } {
  if (!settings) {
    return {}
  }
  const scope = getRuntimeGitScope(settings, connectionId)
  return {
    ...(settings.commitMessageAi !== undefined
      ? { commitMessageAi: settings.commitMessageAi }
      : {}),
    ...(settings.sourceControlAi !== undefined
      ? { sourceControlAi: settings.sourceControlAi }
      : {}),
    ...(settings.agentCmdOverrides !== undefined
      ? { agentCmdOverrides: settings.agentCmdOverrides }
      : {}),
    ...(settings.enableGitHubAttribution !== undefined
      ? { enableGitHubAttribution: settings.enableGitHubAttribution }
      : {}),
    commitMessageDiscoveryHostKey: getCommitMessageModelDiscoveryHostKeyForScope(scope)
  }
}

function getRuntimeGitRepoId(context: RuntimeGitContext): string | undefined {
  return context.worktreeId ? getRepoIdFromWorktreeId(context.worktreeId) : undefined
}

export async function generateRuntimeCommitMessage(
  context: RuntimeGitContext,
  overrides?: RuntimeGenerateCommitMessageOverrides
): Promise<RuntimeGenerateCommitMessageResult> {
  const input = GitGenerateCommitMessageInputSchema.parse({
    worktree: getRuntimeGitWorktree(context),
    repoId: getRuntimeGitRepoId(context),
    ...getRuntimeCommitMessageSettings(context.settings, context.connectionId),
    ...(overrides?.sourceControlAiResolvedParams
      ? { sourceControlAiResolvedParams: overrides.sourceControlAiResolvedParams }
      : {}),
    ...(overrides?.sourceControlAi ? { sourceControlAi: overrides.sourceControlAi } : {}),
    ...(overrides?.agentCmdOverrides ? { agentCmdOverrides: overrides.agentCmdOverrides } : {})
  })
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.generateCommitMessage,
    input,
    { timeoutMs: 75_000 }
  )
}

export async function discoverRuntimeCommitMessageModels(
  context: RuntimeGitContext,
  agentId: string
): Promise<RuntimeDiscoverCommitMessageModelsResult> {
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.discoverCommitMessageModels,
    {
      worktree: getRuntimeGitWorktree(context),
      agentId,
      ...(context.settings?.agentCmdOverrides
        ? { agentCmdOverrides: context.settings.agentCmdOverrides }
        : {})
    },
    { timeoutMs: 75_000 }
  )
}

export async function cancelRuntimeGenerateCommitMessage(
  context: RuntimeGitContext
): Promise<void> {
  await callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.cancelGenerateCommitMessage,
    { worktree: getRuntimeGitWorktree(context) },
    { timeoutMs: 5_000 }
  )
}

export async function generateRuntimePullRequestFields(
  context: RuntimeGitContext,
  input: RuntimePullRequestGenerationInput,
  overrides?: RuntimeGeneratePullRequestFieldsOverrides
): Promise<RuntimeGeneratePullRequestFieldsResult> {
  const request = GitGeneratePullRequestFieldsInputSchema.parse({
    worktree: getRuntimeGitWorktree(context),
    repoId: getRuntimeGitRepoId(context),
    ...input,
    ...getRuntimeCommitMessageSettings(context.settings, context.connectionId),
    ...(overrides?.sourceControlAiResolvedParams
      ? { sourceControlAiResolvedParams: overrides.sourceControlAiResolvedParams }
      : {}),
    ...(overrides?.sourceControlAi ? { sourceControlAi: overrides.sourceControlAi } : {}),
    ...(overrides?.agentCmdOverrides ? { agentCmdOverrides: overrides.agentCmdOverrides } : {})
  })
  return callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.generatePullRequestFields,
    request,
    { timeoutMs: 75_000 }
  )
}

export async function cancelRuntimeGeneratePullRequestFields(
  context: RuntimeGitContext
): Promise<void> {
  await callRuntimeOrpc(
    getRuntimeGitTarget(context),
    (client) => client.git.cancelGeneratePullRequestFields,
    { worktree: getRuntimeGitWorktree(context) },
    { timeoutMs: 5_000 }
  )
}
