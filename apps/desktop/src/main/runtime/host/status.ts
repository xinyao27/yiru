import { handleStatusGet } from '~main/runtime/rpc/methods/status'
import type { RuntimeStatus } from '~shared/runtime-types'

import type { RpcContext } from '../rpc/core'

export function getNodeRuntimeHostStatus(params: void, context: RpcContext): RuntimeStatus {
  return handleStatusGet(params, context)
}
