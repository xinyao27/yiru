import {
  buildBranchNamePrompt,
  sanitizeBranchSlug,
  type BranchNameWorkContext
} from '~shared/branch-name-from-work'
import {
  buildCommitMessagePrompt,
  splitGeneratedCommitMessage,
  type CommitMessageDraftContext,
  type GeneratedCommitMessage
} from '~shared/commit-message/generation'
import { planCommitMessageGeneration } from '~shared/commit-message/plan'
import {
  buildPullRequestFieldsPrompt,
  parseGeneratedPullRequestFields,
  type PullRequestDraftContext
} from '~shared/pull-request-generation'
import { renderSourceControlActionCommandTemplate } from '~shared/source-control/ai-actions'

import { captureAgentGenerationFailureOutput } from './agent-failure-output'
import { trimGeneratedCommitMessage } from './generation-settings'
import type {
  CommitMessageGenerationTarget,
  GenerateBranchNameResult,
  GenerateCommitMessageParams,
  GenerateCommitMessageResult,
  GeneratePullRequestFieldsResult,
  InternalTextGenerationResult
} from './generation-types'
import { cancelLocalTextGeneration, runLocalPlan } from './local-generation'
import { runRemotePlan } from './remote-generation'

function formatCommitMessageGenerationResult(
  result: InternalTextGenerationResult
): GenerateCommitMessageResult {
  if (!result.success) {
    // Keep the bulky local-only capture off the renderer-bound payload.
    return { success: false, error: result.error, canceled: result.canceled }
  }
  let commitMessage: GeneratedCommitMessage
  try {
    commitMessage = splitGeneratedCommitMessage(result.rawOutput)
  } catch {
    return { success: false, error: 'Generated commit message could not be parsed.' }
  }
  return {
    success: true,
    message: trimGeneratedCommitMessage(commitMessage.message),
    agentLabel: result.agentLabel
  }
}

export async function generateCommitMessageFromContext(
  context: CommitMessageDraftContext,
  params: GenerateCommitMessageParams,
  target: CommitMessageGenerationTarget
): Promise<GenerateCommitMessageResult> {
  const basePrompt = buildCommitMessagePrompt(context, '')
  const prompt =
    params.commandInputTemplate !== undefined
      ? renderSourceControlActionCommandTemplate(params.commandInputTemplate, {
          basePrompt,
          branch: context.branch ?? '(detached)',
          stagedFiles: context.stagedSummary,
          stagedPatch: context.stagedPatch
        })
      : buildCommitMessagePrompt(context, params.customPrompt ?? '')
  const planned = planCommitMessageGeneration(params, prompt)
  if (!planned.ok) {
    return { success: false, error: planned.error }
  }

  const internalResult =
    target.kind === 'remote'
      ? await runRemotePlan(planned.plan, target)
      : await runLocalPlan(
          planned.plan,
          target.cwd,
          target.env,
          'message',
          'commit-message',
          target.wslDistro
        )
  return formatCommitMessageGenerationResult(internalResult)
}

export function cancelGeneratePullRequestFieldsLocal(cwd: string): void {
  cancelLocalTextGeneration('pull-request-fields', cwd)
}

function formatPullRequestFieldsGenerationResult(
  result: InternalTextGenerationResult,
  context: PullRequestDraftContext
): GeneratePullRequestFieldsResult {
  if (!result.success) {
    // Keep the bulky local-only capture off the renderer-bound payload.
    return {
      success: false,
      error: result.error,
      canceled: result.canceled,
      branchChangedByPreparation: context.branchChangedByPreparation
    }
  }
  try {
    return {
      success: true,
      fields: parseGeneratedPullRequestFields(result.rawOutput, context),
      agentLabel: result.agentLabel,
      branchChangedByPreparation: context.branchChangedByPreparation
    }
  } catch {
    return {
      success: false,
      error: 'Generated pull request details could not be parsed.',
      branchChangedByPreparation: context.branchChangedByPreparation
    }
  }
}

export async function generatePullRequestFieldsFromContext(
  context: PullRequestDraftContext,
  params: GenerateCommitMessageParams,
  target: CommitMessageGenerationTarget
): Promise<GeneratePullRequestFieldsResult> {
  const basePrompt = buildPullRequestFieldsPrompt(context, '')
  const prompt =
    params.commandInputTemplate !== undefined
      ? renderSourceControlActionCommandTemplate(params.commandInputTemplate, {
          basePrompt,
          branch: context.branch ?? '(detached)',
          baseBranch: context.base,
          currentTitle: context.currentTitle,
          currentBody: context.currentBody,
          commitSummary: context.commitSummary,
          changedFiles: context.changeSummary,
          patch: context.patch
        })
      : buildPullRequestFieldsPrompt(context, params.customPrompt ?? '')
  const planned = planCommitMessageGeneration(params, prompt)
  if (!planned.ok) {
    return {
      success: false,
      error: planned.error,
      branchChangedByPreparation: context.branchChangedByPreparation
    }
  }

  const internalResult =
    target.kind === 'remote'
      ? await runRemotePlan(planned.plan, target, 'details', 'pull-request-fields')
      : await runLocalPlan(
          planned.plan,
          target.cwd,
          target.env,
          'details',
          'pull-request-fields',
          target.wslDistro
        )
  return formatPullRequestFieldsGenerationResult(internalResult, context)
}

/**
 * Generate a short kebab-case branch name from the work the agent is starting.
 * Reuses the commit-message generation plan + spawn machinery; only the prompt
 * and the post-processing (slug sanitization) differ.
 */
export async function generateBranchNameFromContext(
  context: BranchNameWorkContext,
  params: GenerateCommitMessageParams,
  target: CommitMessageGenerationTarget
): Promise<GenerateBranchNameResult> {
  const basePrompt = buildBranchNamePrompt(context)
  const prompt =
    params.commandInputTemplate !== undefined
      ? renderSourceControlActionCommandTemplate(params.commandInputTemplate, {
          basePrompt,
          firstPrompt: context.firstPrompt,
          assistantMessage: context.assistantMessage ?? ''
        })
      : buildBranchNamePrompt(context, params.customPrompt ?? '')
  const planned = planCommitMessageGeneration(params, prompt)
  if (!planned.ok) {
    return { success: false, error: planned.error }
  }

  const internalResult =
    target.kind === 'remote'
      ? await runRemotePlan(planned.plan, target, 'branch name', 'branch-name')
      : await runLocalPlan(
          planned.plan,
          target.cwd,
          target.env,
          'branch name',
          'branch-name',
          target.wslDistro
        )
  if (!internalResult.success) {
    return internalResult
  }
  const slug = sanitizeBranchSlug(internalResult.rawOutput)
  if (!slug) {
    return {
      success: false,
      error: 'Generated branch name was empty after sanitization.',
      // What the model actually returned is the whole diagnosis here.
      failureOutput:
        captureAgentGenerationFailureOutput(planned.plan.label, 0, internalResult.rawOutput, '') ??
        undefined
    }
  }
  return { success: true, slug, agentLabel: internalResult.agentLabel }
}
