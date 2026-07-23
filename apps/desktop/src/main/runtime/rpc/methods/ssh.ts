import { z } from 'zod'

import {
  connectRegisteredSshTarget,
  getRegisteredSshState,
  listRegisteredRemovedSshTargetLabels,
  listRegisteredSshTargets
} from '../../../ipc/ssh'
import { defineMethod, type RpcMethod } from '../core'

const SshTarget = z.object({
  targetId: z.string().min(1)
})

export const SSH_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'ssh.getState',
    mobile: true,
    params: SshTarget,
    handler: (params) => ({ state: getRegisteredSshState(params.targetId) ?? null })
  }),
  defineMethod({
    name: 'ssh.connect',
    mobile: true,
    params: SshTarget,
    handler: async (params) => ({ state: await connectRegisteredSshTarget(params.targetId) })
  }),
  defineMethod({
    name: 'ssh.listTargets',
    mobile: true,
    params: null,
    handler: () => ({ targets: listRegisteredSshTargets() })
  }),
  defineMethod({
    name: 'ssh.listRemovedTargetLabels',
    mobile: true,
    params: null,
    handler: () => ({ labels: listRegisteredRemovedSshTargetLabels() })
  })
]
