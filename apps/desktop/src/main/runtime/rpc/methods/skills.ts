import { parseExecutionHostId } from '@yiru/workbench-model/workspace'

import { SkillDiscoveryTargetSchema } from '../../../../shared/skills'
import { SSH_SKILL_DISCOVERY_RELAY_CAPABILITY } from '../../../../shared/skills'
import type { SkillDiscoveryResult } from '../../../../shared/skills'
import { getActiveMultiplexer } from '../../../ipc/ssh'
import {
  discoverSkillsOnTarget,
  resolveSkillDiscoveryTarget
} from '../../../skills/skill-discovery-target'
import { defineMethod, type RpcMethod } from '../core'

export const SKILL_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'skills.discover',
    params: SkillDiscoveryTargetSchema.default({}),
    handler: async (params, { runtime }) => {
      const executionHost = parseExecutionHostId(params.executionHostId)
      if (executionHost?.kind === 'ssh') {
        const mux = getActiveMultiplexer(executionHost.targetId)
        if (!mux || mux.isDisposed()) {
          throw new Error('SSH skill discovery requires a connected relay.')
        }
        let advertisement: { capabilities?: unknown }
        try {
          advertisement = (await mux.request('session.capabilities')) as {
            capabilities?: unknown
          }
        } catch (error) {
          if (error instanceof Error && (error as Error & { code?: number }).code === -32601) {
            throw new Error('The connected SSH relay does not support skill discovery.')
          }
          throw error
        }
        if (
          !Array.isArray(advertisement.capabilities) ||
          !advertisement.capabilities.includes(SSH_SKILL_DISCOVERY_RELAY_CAPABILITY)
        ) {
          // Why: an older relay may accept the connection but scan no skills;
          // gate before calling the additive method so mixed versions fail closed.
          throw new Error('The connected SSH relay does not support skill discovery.')
        }
        return (await mux.request('skills.discover', {
          cwd: params.cwd ?? undefined
        })) as SkillDiscoveryResult
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
