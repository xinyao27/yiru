import { ORPCError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/websocket'
import {
  encodeRuntimeOrpcSocketFrame,
  RUNTIME_ORPC_SOCKET_PROTOCOL
} from '~shared/runtime-orpc-socket'

import type { YiruRuntimeService } from '../../yiru-runtime'
import type { RpcContext } from '../core'
import { authenticatedTokenFingerprint } from '../orchestration-mutation-executor'
import type {
  UnixSocketProtocolConnection,
  UnixSocketProtocolHandler
} from '../unix-socket-transport'
import { createRuntimeOrpcContext, type RuntimeOrpcInvocationDetails } from './bridge'
import { createRuntimeOrpcHandlerOptions } from './request-metadata'
import { runtimeOrpcRouter } from './router'
import { RuntimeOrpcSocketProtocolHandler } from './socket-protocol-handler'

type RuntimeOrpcSocketDenial = {
  code: string
  status: number
  message: string
}

export type RuntimeOrpcSocketInvocationLease = {
  denial?: RuntimeOrpcSocketDenial
  release?: () => void
}

type RuntimeOrpcSocketHandlerOptions = {
  runtime: YiruRuntimeService
  authToken: string
  mobileDevelopmentPairing: NonNullable<RpcContext['mobileDevelopmentPairing']>
  beforeInvocation: (
    invocation: RuntimeOrpcInvocationDetails,
    connection: UnixSocketProtocolConnection
  ) => Promise<RuntimeOrpcSocketInvocationLease | void> | RuntimeOrpcSocketInvocationLease | void
}

const KEEPALIVE_FRAME = encodeRuntimeOrpcSocketFrame({
  protocol: RUNTIME_ORPC_SOCKET_PROTOCOL,
  type: 'keepalive'
})

export class RuntimeOrpcSocketHandler implements UnixSocketProtocolHandler {
  private readonly protocol: RuntimeOrpcSocketProtocolHandler<
    ReturnType<typeof createRuntimeOrpcContext>
  >

  constructor(options: RuntimeOrpcSocketHandlerOptions) {
    const handler = new RPCHandler(runtimeOrpcRouter, createRuntimeOrpcHandlerOptions())
    this.protocol = new RuntimeOrpcSocketProtocolHandler({
      authToken: options.authToken,
      getRuntimeId: () => options.runtime.getRuntimeId(),
      createContext: (frame, connection) =>
        createRuntimeOrpcContext(options.runtime, {
          authenticatedCallerFingerprint: authenticatedTokenFingerprint(frame.authToken),
          mobileDevelopmentPairing: options.mobileDevelopmentPairing,
          beforeInvocation: async (invocation) => {
            const lease = await options.beforeInvocation(invocation, connection)
            if (lease?.denial) {
              throw new ORPCError(lease.denial.code, {
                status: lease.denial.status,
                message: lease.denial.message
              })
            }
            return lease?.release
          }
        }),
      message: (peer, payload, context) => handler.message(peer, payload, { context }),
      close: (peer) => handler.close(peer)
    })
  }

  open(rawFrame: string, connection: UnixSocketProtocolConnection): boolean {
    return this.protocol.open(rawFrame, connection)
  }

  message(rawFrame: string, connection: UnixSocketProtocolConnection): void {
    this.protocol.message(rawFrame, connection)
  }

  close(connection: UnixSocketProtocolConnection): void {
    this.protocol.close(connection)
  }
}

export function startRuntimeOrpcSocketKeepalive(
  connection: UnixSocketProtocolConnection
): () => void {
  return connection.startKeepalive(KEEPALIVE_FRAME)
}
