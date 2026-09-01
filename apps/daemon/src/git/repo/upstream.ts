import { getPublishTargetStatus } from '@yiru/runtime-protocol/workbench/git/publish-target-status'
import {
  isNoUpstreamError,
  normalizeGitErrorMessage
} from '@yiru/runtime-protocol/workbench/git/remote-error'
import type { GitPushTarget, GitUpstreamStatus } from '@yiru/runtime-protocol/workbench/types'
import { getEffectiveGitUpstreamStatus } from '~main/git/repo/effective-upstream'
import { upstreamOnlyCommitsArePatchEquivalent } from '~main/git/status/cherry-patch-equivalence'

import { gitExecFileAsync } from '../runner/runner'
import { validateGitPushTarget } from './push-target-validation'

type GitExecOptions = {
  wslDistro?: string
}

function gitExecOptions(
  cwd: string,
  options: GitExecOptions = {}
): { cwd: string; wslDistro?: string } {
  return options.wslDistro ? { cwd, wslDistro: options.wslDistro } : { cwd }
}

async function getBehindCommitsArePatchEquivalent(
  worktreePath: string,
  upstreamName: string,
  options: GitExecOptions = {}
): Promise<boolean> {
  try {
    const { stdout } = await gitExecFileAsync(
      ['log', '--oneline', '--cherry-mark', '--right-only', `HEAD...${upstreamName}`, '--'],
      gitExecOptions(worktreePath, options)
    )
    return upstreamOnlyCommitsArePatchEquivalent(stdout)
  } catch {
    // Why: patch-equivalence is an optimization for the rebase case. If the
    // probe fails, keep the conservative pull-first behavior.
    return false
  }
}

export async function getUpstreamStatus(
  worktreePath: string,
  pushTarget?: GitPushTarget,
  options: GitExecOptions = {}
): Promise<GitUpstreamStatus> {
  try {
    if (pushTarget) {
      const target = await validateGitPushTarget(worktreePath, pushTarget, options)
      return await getPublishTargetStatus(
        (args) => gitExecFileAsync(args, gitExecOptions(worktreePath, options)),
        target,
        (upstreamName) => getBehindCommitsArePatchEquivalent(worktreePath, upstreamName, options)
      )
    }
    return await getEffectiveGitUpstreamStatus(
      (args) => gitExecFileAsync(args, gitExecOptions(worktreePath, options)),
      (upstreamName) => getBehindCommitsArePatchEquivalent(worktreePath, upstreamName, options)
    )
  } catch (error) {
    // Why: we only swallow clearly-no-upstream signals — that's an expected
    // state, not a failure. Other errors (auth, corruption, "not a git
    // repository", sparse-checkout) should surface to the user so they can
    // act on them. The shared isNoUpstreamError helper intentionally omits
    // broad phrases like "no such branch" to avoid masking real errors.
    if (isNoUpstreamError(error)) {
      return {
        hasUpstream: false,
        ahead: 0,
        behind: 0
      }
    }
    // Why: parity with gitPush/gitPull/gitFetch — normalize before crossing
    // the IPC boundary so renderers don't see execFile stderr preambles or local paths.
    throw new Error(normalizeGitErrorMessage(error, 'upstream'))
  }
}
