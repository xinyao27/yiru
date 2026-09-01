import type { RuntimeStatus } from '@yiru/runtime-protocol/workbench/runtime-types'
import { handleStatusGet } from '~main/runtime/rpc/methods/status'

import type { RpcContext } from '../rpc/core'

export function getNodeRuntimeHostStatus(params: void, context: RpcContext): RuntimeStatus {
  return handleStatusGet(params, context)
}
