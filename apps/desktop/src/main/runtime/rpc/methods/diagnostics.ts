import { defineMethod, type RpcMethod } from '../core'

export const DIAGNOSTICS_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'diagnostics.memory',
    mobile: true,
    params: null,
    access: { scope: 'host', tier: 'read' },
    handler: async (_params, { runtime }) => {
      return await runtime.getMemorySnapshot()
    }
  })
]
