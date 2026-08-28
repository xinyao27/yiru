import type {
  GitDiscoverCommitMessageModelsInputSchema,
  GitGenerateCommitMessageInputSchema,
  GitGeneratePullRequestFieldsInputSchema,
  GitWorktreeSelectorInputSchema
} from '@yiru/runtime-protocol/contract'
import type { ResolvedSourceControlAiGenerationParams } from '@yiru/runtime-protocol/workbench/source-control/ai'
import type { GlobalSettings } from '@yiru/runtime-protocol/workbench/types'
import type { z } from 'zod'

import type { RpcContext } from '../core'

type CommitMessageGenerationOverride = {
  commitMessageAi?: GlobalSettings['commitMessageAi']
  sourceControlAi?: GlobalSettings['sourceControlAi']
  sourceControlAiResolvedParams?: ResolvedSourceControlAiGenerationParams
  agentCmdOverrides?: GlobalSettings['agentCmdOverrides']
  enableGitHubAttribution?: boolean
  commitMessageDiscoveryHostKey?: string
}

// Why: both generation paths share the optional overrides, while undefined preserves
// the runtime's no-override behavior when the caller supplies none of them.
function buildCommitMessageGenerationOverride(params: {
  commitMessageAi?: unknown
  sourceControlAi?: unknown
  sourceControlAiResolvedParams?: unknown
  agentCmdOverrides?: unknown
  enableGitHubAttribution?: boolean
  commitMessageDiscoveryHostKey?: string
}): CommitMessageGenerationOverride | undefined {
  if (
    params.commitMessageAi === undefined &&
    params.sourceControlAi === undefined &&
    params.sourceControlAiResolvedParams === undefined &&
    params.agentCmdOverrides === undefined &&
    params.enableGitHubAttribution === undefined &&
    params.commitMessageDiscoveryHostKey === undefined
  ) {
    return undefined
  }
  return {
    ...(params.commitMessageAi !== undefined
      ? { commitMessageAi: params.commitMessageAi as GlobalSettings['commitMessageAi'] }
      : {}),
    ...(params.sourceControlAi !== undefined
      ? { sourceControlAi: params.sourceControlAi as GlobalSettings['sourceControlAi'] }
      : {}),
    ...(params.sourceControlAiResolvedParams !== undefined
      ? {
          sourceControlAiResolvedParams:
            params.sourceControlAiResolvedParams as ResolvedSourceControlAiGenerationParams
        }
      : {}),
    ...(params.agentCmdOverrides !== undefined
      ? {
          agentCmdOverrides: params.agentCmdOverrides as GlobalSettings['agentCmdOverrides']
        }
      : {}),
    ...(params.enableGitHubAttribution !== undefined
      ? { enableGitHubAttribution: params.enableGitHubAttribution }
      : {}),
    ...(params.commitMessageDiscoveryHostKey !== undefined
      ? { commitMessageDiscoveryHostKey: params.commitMessageDiscoveryHostKey }
      : {})
  }
}

export const handleGitGenerateCommitMessage = (
  params: z.infer<typeof GitGenerateCommitMessageInputSchema>,
  { gitCommands }: RpcContext
) => {
  const override = buildCommitMessageGenerationOverride(params)
  return gitCommands.generateRuntimeCommitMessage(params.worktree, override, params.repoId)
}

export const handleGitDiscoverCommitMessageModels = (
  params: z.infer<typeof GitDiscoverCommitMessageModelsInputSchema>,
  { gitCommands }: RpcContext
) =>
  gitCommands.discoverRuntimeCommitMessageModels(
    params.worktree,
    params.agentId,
    params.agentCmdOverrides !== undefined
      ? { agentCmdOverrides: params.agentCmdOverrides as GlobalSettings['agentCmdOverrides'] }
      : {}
  )

export const handleGitCancelGenerateCommitMessage = (
  params: z.infer<typeof GitWorktreeSelectorInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.cancelRuntimeGenerateCommitMessage(params.worktree)

export const handleGitGeneratePullRequestFields = (
  params: z.infer<typeof GitGeneratePullRequestFieldsInputSchema>,
  { gitCommands }: RpcContext
) => {
  const input = {
    base: params.base,
    title: params.title,
    body: params.body,
    draft: params.draft,
    provider: params.provider,
    useTemplate: params.useTemplate
  }
  const override = buildCommitMessageGenerationOverride(params)
  return gitCommands.generateRuntimePullRequestFields(
    params.worktree,
    input,
    override,
    params.repoId
  )
}

export const handleGitCancelGeneratePullRequestFields = (
  params: z.infer<typeof GitWorktreeSelectorInputSchema>,
  { gitCommands }: RpcContext
) => gitCommands.cancelRuntimeGeneratePullRequestFields(params.worktree)
