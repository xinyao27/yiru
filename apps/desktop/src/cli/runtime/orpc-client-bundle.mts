import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/websocket'

import type { RuntimeOrpcClient, RuntimeOrpcFacade, RuntimeOrpcLink } from './orpc-client-types.js'

export const createClient: RuntimeOrpcFacade['createClient'] = (link) =>
  createORPCClient<RuntimeOrpcClient>(link)

export const createSocketLink: RuntimeOrpcFacade['createSocketLink'] = (socket, headers) => {
  // Why: the CLI peer intentionally implements only the WebSocket members the oRPC
  // adapter consumes. Keep that narrower audited boundary out of the transport itself.
  const websocket = socket as unknown as Pick<
    WebSocket,
    'addEventListener' | 'removeEventListener' | 'send' | 'readyState'
  >
  return new RPCLink({ websocket, headers }) as RuntimeOrpcLink
}
