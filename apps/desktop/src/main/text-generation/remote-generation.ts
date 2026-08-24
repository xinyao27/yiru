import type { CommitMessagePlan } from '~shared/commit-message/plan'

import { WINDOWS_BATCH_UNSAFE_ARGUMENTS_ERROR } from '../windows-host'
import { finalizeFromAgentOutput, userFacingUnsafeWindowsBatchArgs } from './generation-failure'
import { GENERATION_TIMEOUT_MS } from './generation-limits'
import type {
  CommitMessageGenerationTarget,
  InternalTextGenerationResult,
  RemoteCommitMessageExecResult,
  TextGenerationOperation
} from './generation-types'

export async function runRemotePlan(
  plan: CommitMessagePlan,
  target: Extract<CommitMessageGenerationTarget, { kind: 'remote' }>,
  emptyResultName = 'message',
  operation: TextGenerationOperation = 'commit-message'
): Promise<InternalTextGenerationResult> {
  const { binary, label } = plan
  let result: RemoteCommitMessageExecResult
  try {
    result = await target.execute(plan, target.cwd, GENERATION_TIMEOUT_MS, operation)
  } catch (error) {
    console.error('[commit-message] Remote generator request failed:', error)
    return {
      success: false,
      error: `${label} could not be reached on the ${target.missingBinaryLocation}. Try again after the SSH connection recovers.`
    }
  }
  if (result.spawnError) {
    if (result.spawnError === WINDOWS_BATCH_UNSAFE_ARGUMENTS_ERROR) {
      return {
        success: false,
        error: userFacingUnsafeWindowsBatchArgs(label)
      }
    }
    if (/ENOENT/i.test(result.spawnError)) {
      return {
        success: false,
        error: `${binary} not found on the ${target.missingBinaryLocation}. Install ${label} there.`
      }
    }
    console.error('[commit-message] Remote generator spawn failed:', result.spawnError)
    return {
      success: false,
      error: `${label} could not be started on the ${target.missingBinaryLocation}. Check the agent command there and try again.`
    }
  }
  if (result.canceled) {
    return { success: false, error: 'Generation canceled.', canceled: true }
  }
  if (result.timedOut) {
    return {
      success: false,
      error: `Generation timed out after ${GENERATION_TIMEOUT_MS / 1000}s.`
    }
  }

  return new Promise((resolve) => {
    finalizeFromAgentOutput({
      code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      label,
      emptyResultName,
      finalize: resolve,
      // Why: remote agent output reflects the SSH target, not this Mac's DNS.
      includeLocalMacDnsHint: false,
      // Branch failures persist into synced metadata; stdout may echo the prompt.
      includeStdoutDetail: operation !== 'branch-name'
    })
  })
}
