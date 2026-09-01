import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/websocket'
import { runtimeContract } from '@yiru/runtime-protocol/contract'

import type { RuntimeOrpcClient, RuntimeOrpcLink } from './orpc-types'

export const runtimeContractValue: unknown = runtimeContract

export function createRuntimeOrpcClient(link: RuntimeOrpcLink): RuntimeOrpcClient {
  return createORPCClient<RuntimeOrpcClient>(link)
}

export function createRuntimeOrpcSocketLink(
  websocket: WebSocket,
  headers: Record<string, string>
): RuntimeOrpcLink {
  return new RPCLink({ websocket, headers })
}
