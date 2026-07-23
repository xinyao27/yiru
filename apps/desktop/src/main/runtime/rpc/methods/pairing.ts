import {
  PairingGetEndpointsParamsSchema,
  PairingProvisionRelayParamsSchema
} from '@yiru/mobile-relay-protocol/credential-contract'

import { defineMethod, type RpcAnyMethod } from '../core'

export const PAIRING_METHODS: readonly RpcAnyMethod[] = [
  defineMethod({
    name: 'pairing.getEndpoints',
    mobile: true,
    params: PairingGetEndpointsParamsSchema,
    handler: async (params, ctx) => {
      if (!ctx.pairing) {
        throw new Error('pairing_context_unavailable')
      }
      return await ctx.pairing.getEndpoints(params)
    }
  }),
  defineMethod({
    name: 'pairing.provisionRelay',
    mobile: true,
    params: PairingProvisionRelayParamsSchema,
    handler: async (params, ctx) => {
      if (!ctx.pairing) {
        throw new Error('pairing_context_unavailable')
      }
      return await ctx.pairing.provisionRelay(params)
    }
  })
]
