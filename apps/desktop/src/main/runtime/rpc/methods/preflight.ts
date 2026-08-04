import { z } from 'zod'
import {
  detectRemoteAgents,
  detectInstalledAgentsWithShellPathHydration,
  refreshShellPathAndDetectAgents,
  runPreflightCheck
} from '~main/preflight/preflight'

import { defineMethod, type RpcMethod } from '../core'

const PreflightCheck = z.object({
  force: z.boolean().optional()
})
const PreflightDetectRemoteAgents = z.object({
  connectionId: z.string().min(1)
})

export const PREFLIGHT_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'preflight.check',
    mobile: true,
    params: PreflightCheck,
    access: { scope: 'host', tier: 'read' },
    handler: async (params) => runPreflightCheck(params.force)
  }),
  defineMethod({
    name: 'preflight.detectAgents',
    mobile: true,
    params: null,
    access: { scope: 'host', tier: 'read' },
    handler: async () => detectInstalledAgentsWithShellPathHydration()
  }),
  defineMethod({
    name: 'preflight.detectRemoteAgents',
    mobile: true,
    params: PreflightDetectRemoteAgents,
    access: { scope: 'host', tier: 'read' },
    handler: async (params) => detectRemoteAgents(params)
  }),
  defineMethod({
    name: 'preflight.refreshAgents',
    params: null,
    // Why: not a probe — it re-spawns the user's login shell and merges the
    // resulting segments into this process's PATH, so it mutates host state.
    access: { scope: 'host', tier: 'host' },
    handler: async () => refreshShellPathAndDetectAgents()
  })
]
