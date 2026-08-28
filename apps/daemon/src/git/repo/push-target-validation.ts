import type { GitPushTarget } from '@yiru/runtime-protocol/workbench/types'
import { assertGitPushTargetShape } from '~main/git/repo/push-target-shape'

import { gitExecFileAsync } from '../runner/runner'

type GitExecOptions = {
  wslDistro?: string
}

export async function validateGitPushTarget(
  repoPath: string,
  target: unknown,
  options: GitExecOptions = {}
): Promise<GitPushTarget> {
  assertGitPushTargetShape(target)
  await gitExecFileAsync(['check-ref-format', '--branch', target.branchName], {
    cwd: repoPath,
    ...options
  })
  return target
}
