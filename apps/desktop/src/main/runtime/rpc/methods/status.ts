import { STATUS_GET_CONTRACT } from '../../../../shared/runtime-method-contracts/runtime-control-contracts'
import { defineMethod, type RpcMethod } from '../core'

export const STATUS_METHODS: RpcMethod[] = [
  defineMethod({
    contract: STATUS_GET_CONTRACT,
    handler: (_params, { runtime }) => runtime.getStatus()
  })
]
