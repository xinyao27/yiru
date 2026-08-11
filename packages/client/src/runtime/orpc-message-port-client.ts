import { createORPCClient, type ClientLink } from '@orpc/client'
import { RPCLink } from '@orpc/client/message-port'
import type { ContractRouterClient, runtimeContract } from '@yiru/runtime-protocol/contract'
import {
  RUNTIME_ORPC_BINARY_SIDE_CHANNEL_HEADER,
  RUNTIME_ORPC_FEATURE_INTERACTION_SOURCE_HEADER,
  RUNTIME_ORPC_REQUEST_ID_HEADER
} from '@yiru/runtime-protocol/orpc-peer-frame'
import {
  isBrowserPaneUiRuntimeRpcParams,
  YIRU_RUNTIME_RPC_BROWSER_UI_SOURCE
} from '~shared/runtime-rpc-feature-interaction-source'

import {
  retainRuntimeOrpcBinaryRoute,
  RuntimeOrpcBinarySideChannel,
  type RuntimeOrpcBinaryListener
} from './orpc-binary-side-channel'

const RUNTIME_ORPC_REQUEST_CONTEXT = Symbol('runtime-orpc-request-context')

export type RuntimeOrpcClientContext = {
  onBinary?: RuntimeOrpcBinaryListener
}

type RuntimeOrpcInternalClientContext = RuntimeOrpcClientContext & {
  [RUNTIME_ORPC_REQUEST_CONTEXT]: string
}

export type RuntimeOrpcClient = ContractRouterClient<
  typeof runtimeContract,
  RuntimeOrpcClientContext
>

export type RuntimeOrpcClientConnection = {
  client: RuntimeOrpcClient
  // Why: 'web-peer' marks a connection routed through a paired web client's own
  // negotiated oRPC peer (see `orpc-web-environment-client.ts`) — distinct from
  // 'legacy' because the underlying transport may in fact be real oRPC, decided
  // inside `WebRuntimeClient`, not visible at connection-creation time here.
  transport: 'message-port' | 'legacy' | 'web-peer'
  close: () => void
}

export function createRuntimeOrpcMessagePortConnection(
  port: MessagePort
): RuntimeOrpcClientConnection {
  const sideChannel = new RuntimeOrpcBinarySideChannel(port)
  const transportLink = new RPCLink<RuntimeOrpcInternalClientContext>({
    port,
    headers: (options, _path, input) => ({
      [RUNTIME_ORPC_REQUEST_ID_HEADER]: options.context[RUNTIME_ORPC_REQUEST_CONTEXT],
      [RUNTIME_ORPC_BINARY_SIDE_CHANNEL_HEADER]: '1',
      ...(isBrowserPaneUiRuntimeRpcParams(input)
        ? {
            [RUNTIME_ORPC_FEATURE_INTERACTION_SOURCE_HEADER]: YIRU_RUNTIME_RPC_BROWSER_UI_SOURCE
          }
        : {})
    })
  })
  const link: ClientLink<RuntimeOrpcClientContext> = {
    call: async (path, input, options) => {
      const requestId = crypto.randomUUID()
      const release = sideChannel.register(requestId, options.context.onBinary)
      try {
        const output = await transportLink.call(path, input, {
          ...options,
          context: { ...options.context, [RUNTIME_ORPC_REQUEST_CONTEXT]: requestId }
        })
        return retainRuntimeOrpcBinaryRoute(output, release)
      } catch (error) {
        release()
        throw error
      }
    }
  }
  return {
    client: createORPCClient<RuntimeOrpcClient>(link),
    transport: 'message-port',
    close: () => {
      sideChannel.close()
      port.dispatchEvent(new Event('close'))
      port.close()
    }
  }
}
