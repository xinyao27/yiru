import { CURSOR_USAGE_GET_CONTRACT } from '../../../../shared/runtime-method-contracts/provider-usage-contracts'
import { fetchCursorRateLimits } from '../../cursor-usage/fetcher'
import { defineMethod, type RpcMethod } from '../core'

export const PROVIDER_USAGE_METHODS: RpcMethod[] = [
  defineMethod({
    contract: CURSOR_USAGE_GET_CONTRACT,
    handler: (_params, { signal }) => fetchCursorRateLimits({ signal, target: { runtime: 'host' } })
  })
]
