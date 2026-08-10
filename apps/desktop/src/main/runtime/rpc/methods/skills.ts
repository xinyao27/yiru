import type { SkillDiscoverInput, SkillDiscoveryResult } from '@yiru/runtime-protocol/contract'
import {
  discoverSkillsOnTarget,
  resolveSkillDiscoveryTarget
} from '~main/skills/skill-discovery-target'

import type { RpcContext } from '../core'

export async function discoverRuntimeSkills(
  params: SkillDiscoverInput,
  { runtime }: RpcContext
): Promise<SkillDiscoveryResult> {
  // Why: fail closed instead of scanning this host for a remote host's
  // skills — an empty result would read as "that host has no skills".
  if (params.executionHostId?.startsWith('ssh:')) {
    throw new Error('Skill discovery is no longer supported on remote hosts.')
  }
  // Why: the executing runtime owns WSL project preferences. Remote callers
  // send worktree identity only; trusting their projectRuntime absence
  // would scan this host's native filesystem for a WSL-configured project.
  const target = params.projectRuntime
    ? params
    : {
        ...params,
        projectRuntime: runtime.resolveProjectRuntimeForWorktree(params.worktreeId)
      }
  return discoverSkillsOnTarget(resolveSkillDiscoveryTarget(target), runtime.listRepos())
}
