import { randomUUID } from 'node:crypto'

import { ORPCError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/websocket'
import { translateMain } from '~main/i18n/main-i18n'
import { RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY } from '~shared/runtime-orpc-socket'

import type { RpcContext } from '../rpc/core'
import { createRuntimeOrpcContext } from '../rpc/orpc/bridge'
import { createRuntimeOrpcHandlerOptions } from '../rpc/orpc/request-metadata'
import { RuntimeOrpcSocketProtocolHandler } from '../rpc/orpc/socket-protocol-handler'
import type { UnixSocketProtocolHandler } from '../rpc/unix-socket-transport'
import { TerminalMultiplexConnections } from '../terminal-multiplex/connections'
import type { YiruRuntimeService } from '../yiru-runtime'
import { nodeRuntimeHostOrpcHandlerHooks } from './procedure-availability'
import { nodeRuntimeHostRouter } from './router'

type NodeRuntimeHostSocketHandlerOptions = {
  runtime: YiruRuntimeService
  authToken: string
  mobileDevelopmentPairing: NonNullable<RpcContext['mobileDevelopmentPairing']>
}

export function createNodeRuntimeHostSocketHandler({
  runtime,
  authToken,
  mobileDevelopmentPairing
}: NodeRuntimeHostSocketHandlerOptions): UnixSocketProtocolHandler {
  const handler = new RPCHandler(
    nodeRuntimeHostRouter,
    createRuntimeOrpcHandlerOptions(nodeRuntimeHostOrpcHandlerHooks)
  )
  const terminalMultiplex = new TerminalMultiplexConnections()
  return new RuntimeOrpcSocketProtocolHandler({
    authToken,
    getRuntimeId: () => runtime.getRuntimeId(),
    createContext: (frame, connection, peer) => {
      const connectionId = randomUUID()
      const supportsInboundBinaryStreams =
        frame.capabilities?.includes(RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY) === true
      return createRuntimeOrpcContext(runtime, {
        connectionId,
        mobileDevelopmentPairing,
        // Why: Electron reaches selected runtimes through this authenticated
        // OS-local socket. Paired Web and mobile sockets never receive this
        // production-canary bypass.
        allowUnadvertisedTerminalMultiplex: true,
        beforeInvocation: (invocation) => {
          if (
            terminalMultiplex.admitInvocation(
              connectionId,
              invocation.method,
              invocation.input,
              'local-runtime-client',
              invocation.requestId
            ) === 'accepted'
          ) {
            return
          }
          throw new ORPCError('binary_terminal_stream_requires_dedicated_connection', {
            status: 409,
            message: translateMain(
              'runtimeHost.terminalMultiplexDedicatedConnection',
              'Terminal multiplex requires its own connection'
            )
          })
        },
        ...(supportsInboundBinaryStreams
          ? {
              sendBinary: (payload: Uint8Array<ArrayBufferLike>) => {
                const bytes = new Uint8Array(payload.byteLength)
                bytes.set(payload)
                peer.send(bytes.buffer)
              },
              registerBinaryStreamHandler: (
                streamId: number,
                streamHandler: Parameters<TerminalMultiplexConnections['register']>[2]
              ) => terminalMultiplex.register(connectionId, streamId, streamHandler),
              openTerminalMultiplex: (input) =>
                terminalMultiplex.issueTicket(
                  'local-runtime-client',
                  input.clientInstanceId,
                  input.environmentId,
                  'local-runtime-socket'
                ),
              activateTerminalMultiplexEpoch: () =>
                terminalMultiplex.activateEpoch(connectionId, () => connection.close()),
              terminalMultiplexQueueBytes: connection.bufferedBytes
            }
          : {})
      })
    },
    message: (peer, payload, context) => handler.message(peer, payload, { context }),
    binaryStream: (streamId, payload, context) =>
      context.connectionId && streamId >= 0
        ? terminalMultiplex.handle(context.connectionId, payload)
        : false,
    close: (peer) => handler.close(peer),
    closeContext: (context) => {
      if (context.connectionId) {
        terminalMultiplex.closeConnection(context.connectionId)
        runtime.cleanupSubscriptionsForConnection(context.connectionId)
      }
    }
  })
}
