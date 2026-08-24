import type {
  CommitMessageAgentCapability,
  CommitMessageModelCapability
} from '~shared/commit-message/agent-spec'
import type { CommitMessagePlan } from '~shared/commit-message/plan'
import type { GeneratedPullRequestFields } from '~shared/pull-request-generation'
import type { ResolvedSourceControlAiGenerationParams } from '~shared/source-control/ai'

import type { AgentGenerationFailureOutput } from './agent-failure-output'

export type GenerateCommitMessageParams = ResolvedSourceControlAiGenerationParams

export type GenerateCommitMessageResult =
  | { success: true; message: string; agentLabel?: string }
  | { success: false; error: string; canceled?: boolean }

export type DiscoverCommitMessageModelsResult =
  | {
      success: true
      capability: CommitMessageAgentCapability
      models: CommitMessageModelCapability[]
      defaultModelId: string
    }
  | { success: false; error: string }

export type GeneratePullRequestFieldsResult =
  | {
      success: true
      fields: GeneratedPullRequestFields
      agentLabel?: string
      branchChangedByPreparation?: boolean
    }
  | { success: false; error: string; canceled?: boolean; branchChangedByPreparation?: boolean }

export type RemoteCommitMessageExecResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  canceled?: boolean
  spawnError?: string
}

export type TextGenerationOperation = 'commit-message' | 'pull-request-fields' | 'branch-name'

export type CommitMessageGenerationTarget =
  | { kind: 'local'; cwd: string; env?: NodeJS.ProcessEnv; wslDistro?: string }
  | {
      kind: 'remote'
      cwd: string
      execute: (
        plan: CommitMessagePlan,
        cwd: string,
        timeoutMs: number,
        operation: TextGenerationOperation
      ) => Promise<RemoteCommitMessageExecResult>
      missingBinaryLocation: string
    }

export type ResolveCommitMessageSettingsResult =
  | { ok: true; params: GenerateCommitMessageParams }
  | { ok: false; error: string }

export type InternalTextGenerationResult =
  | { success: true; rawOutput: string; agentLabel?: string }
  | {
      success: false
      error: string
      canceled?: boolean
      /** Bounded full CLI output for on-demand local display. Stripped from
       *  every renderer-bound result so it never crosses IPC wholesale. */
      failureOutput?: AgentGenerationFailureOutput
    }

export type CommitMessageModelDiscoveryLocalOptions = {
  cwd?: string
  wslDistro?: string
}

export type GenerateBranchNameResult =
  | { success: true; slug: string; agentLabel?: string }
  | {
      success: false
      error: string
      canceled?: boolean
      failureOutput?: AgentGenerationFailureOutput
    }
