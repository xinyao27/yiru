import { parseExecutionHostId } from '@yiru/workbench-model/workspace'
import {
  discoverSkillsOnTarget,
  resolveSkillDiscoveryTarget
} from '~main/skills/skill-discovery-target'
import { SkillDiscoveryTargetSchema } from '~shared/skills'

import { defineMethod, type RpcMethod } from '../core'

export const SKILL_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'skills.discover',
    params: SkillDiscoveryTargetSchema.default({}),
    access: { scope: 'host', tier: 'read' },
    handler: async (params, { runtime }) => {
      // Why: fail closed instead of scanning this host for a remote host's
      // skills — an empty result would read as "that host has no skills".
      if (parseExecutionHostId(params.executionHostId)?.kind === 'ssh') {
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
  })
]
