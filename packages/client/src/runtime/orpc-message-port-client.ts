import { createORPCClient, type ClientLink } from '@orpc/client'
import { RPCLink } from '@orpc/client/message-port'
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
  RuntimeOrpcBinarySideChannel
} from './orpc-binary-side-channel'
import type {
  RuntimeOrpcClient,
  RuntimeOrpcClientConnection,
  RuntimeOrpcClientContext
} from './orpc-connection'

export type {
  RuntimeOrpcClient,
  RuntimeOrpcClientConnection,
  RuntimeOrpcClientContext
} from './orpc-connection'

const RUNTIME_ORPC_REQUEST_CONTEXT = Symbol('runtime-orpc-request-context')

type RuntimeOrpcInternalClientContext = RuntimeOrpcClientContext & {
  [RUNTIME_ORPC_REQUEST_CONTEXT]: string
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
