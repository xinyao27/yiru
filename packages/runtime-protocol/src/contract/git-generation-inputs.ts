import { z } from 'zod'

import { GitWorktreeSelectorInputSchema } from './git-inputs.js'

const CommitMessageModelCapability = z.object({
  id: z.string(),
  label: z.string(),
  thinkingLevels: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
  defaultThinkingLevel: z.string().optional()
})

const CommitMessageAiSettings = z.object({
  enabled: z.boolean(),
  agentId: z.string().nullable(),
  selectedModelByAgent: z.record(z.string(), z.string()),
  selectedModelByAgentByHost: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  discoveredModelsByAgent: z.record(z.string(), z.array(CommitMessageModelCapability)).optional(),
  discoveredModelsByAgentByHost: z
    .record(z.string(), z.record(z.string(), z.array(CommitMessageModelCapability)))
    .optional(),
  selectedThinkingByModel: z.record(z.string(), z.string()),
  customPrompt: z.string(),
  customAgentCommand: z.string()
})

const SourceControlAiSettings = CommitMessageAiSettings.omit({ customPrompt: true }).extend({
  actions: z
    .record(
      z.string(),
      z.object({
        agentId: z.string().nullable().optional(),
        commandInputTemplate: z.string().optional(),
        agentArgs: z.string().optional()
      })
    )
    .optional(),
  instructionsByOperation: z.record(z.string(), z.string()).optional(),
  modelOverridesByOperation: z
    .record(
      z.string(),
      z.object({
        selectedModelByAgent: z.record(z.string(), z.string()).optional(),
        selectedModelByAgentByHost: z
          .record(z.string(), z.record(z.string(), z.string()))
          .optional(),
        selectedThinkingByModel: z.record(z.string(), z.string()).optional()
      })
    )
    .optional(),
  prCreationDefaults: z
    .object({
      draft: z.boolean().optional(),
      useTemplate: z.boolean().optional(),
      generateDetailsOnOpen: z.boolean().optional(),
      openAfterCreate: z.boolean().optional()
    })
    .optional(),
  launchActionDefaults: z
    .record(
      z.string(),
      z.object({
        agentId: z.string().nullable().optional(),
        commandInputTemplate: z.string().optional(),
        agentArgs: z.string().optional()
      })
    )
    .optional()
})

const ResolvedSourceControlAiGenerationParams = z.object({
  agentId: z.string(),
  model: z.string(),
  thinkingLevel: z.string().optional(),
  customPrompt: z.string().optional(),
  commandInputTemplate: z.string().optional(),
  agentArgs: z.string().optional(),
  customAgentCommand: z.string().optional(),
  agentCommandOverride: z.string().optional()
})

export const GitGenerateCommitMessageInputSchema = GitWorktreeSelectorInputSchema.extend({
  commitMessageAi: CommitMessageAiSettings.optional(),
  sourceControlAi: SourceControlAiSettings.optional(),
  sourceControlAiResolvedParams: ResolvedSourceControlAiGenerationParams.optional(),
  agentCmdOverrides: z.record(z.string(), z.string()).optional(),
  enableGitHubAttribution: z.boolean().optional(),
  commitMessageDiscoveryHostKey: z.string().optional()
})

export const GitDiscoverCommitMessageModelsInputSchema = GitWorktreeSelectorInputSchema.extend({
  agentId: z.string().min(1, 'Missing agent id'),
  agentCmdOverrides: z.record(z.string(), z.string()).optional()
})

export const GitGeneratePullRequestFieldsInputSchema = GitGenerateCommitMessageInputSchema.extend({
  base: z.string().min(1, 'Missing base branch'),
  title: z.string(),
  body: z.string(),
  draft: z.boolean(),
  provider: z
    .enum(['github', 'gitlab', 'bitbucket', 'azure-devops', 'gitea', 'unsupported'])
    .optional(),
  useTemplate: z.boolean().optional()
})
