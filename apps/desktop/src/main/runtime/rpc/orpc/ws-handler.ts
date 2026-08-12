import { ORPCError, type AnyRouter } from '@orpc/server'
import { RPCHandler, type MinimalWebsocket } from '@orpc/server/websocket'
import {
  decodeRuntimeOrpcBinaryFrame,
  decodeRuntimeOrpcTextFrame,
  encodeRuntimeOrpcBinaryFrame,
  encodeRuntimeOrpcTextFrame
} from '@yiru/runtime-protocol/orpc-peer-frame'
import type { TerminalMultiplexFrame } from '@yiru/runtime-protocol/terminal-multiplex/frame'
import { translateMain } from '~main/i18n/main-i18n'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'

import type { AuthenticatedMobileSocket } from '../mobile-socket-wiring'
import { authenticatedTokenFingerprint } from '../orchestration-mutation-executor'
import {
  createRuntimeOrpcContext,
  type RuntimeOrpcAdmission,
  type RuntimeOrpcContext,
  type RuntimeOrpcInvocationDetails
} from './bridge'
import { createRuntimeOrpcHandlerOptions } from './request-metadata'
import type { RuntimeOrpcHandlerHooks } from './request-metadata'
import { webShellServicesConnectionId } from './shell-services-identity'
import { RuntimeShellServicesWsLinks } from './shell-services-ws'

type RuntimeOrpcWsDenial = {
  code: string
  status: number
  message: string
}

export type RuntimeOrpcWsInvocationLease = {
  denial?: RuntimeOrpcWsDenial
  release?: () => void
}

type RuntimeOrpcWsHandlerOptions = {
  runtime: YiruRuntimeService
  router: AnyRouter
  resolveAdmission: (socket: AuthenticatedMobileSocket) => RuntimeOrpcAdmission | null
  beforeInvocation: (
    socket: AuthenticatedMobileSocket,
    invocation: RuntimeOrpcInvocationDetails
  ) => Promise<RuntimeOrpcWsInvocationLease | void> | RuntimeOrpcWsInvocationLease | void
  registerBinaryStreamHandler: (
    connectionId: string,
    streamId: number,
    handler: (frame: TerminalMultiplexFrame) => void
  ) => () => void
  openTerminalMultiplex?: (
    socket: AuthenticatedMobileSocket,
    input: Parameters<NonNullable<RuntimeOrpcContext['openTerminalMultiplex']>>[0]
  ) => ReturnType<NonNullable<RuntimeOrpcContext['openTerminalMultiplex']>>
  activateTerminalMultiplexEpoch?: (socket: AuthenticatedMobileSocket) => boolean
  handlerHooks?: RuntimeOrpcHandlerHooks
}

type SendText = (response: string) => void
type SendBinary = (response: Uint8Array<ArrayBufferLike>) => boolean | void

export class RuntimeOrpcWsHandler {
  private readonly handler: RPCHandler<RuntimeOrpcContext>
  private readonly peers = new Map<AuthenticatedMobileSocket['ws'], EncryptedOrpcPeer>()
  private readonly shellServices = new RuntimeShellServicesWsLinks()

  constructor(private readonly options: RuntimeOrpcWsHandlerOptions) {
    this.handler = new RPCHandler(
      options.router,
      createRuntimeOrpcHandlerOptions(options.handlerHooks)
    )
  }

  handleText(socket: AuthenticatedMobileSocket, frame: string): boolean {
    if (this.shellServices.handleText(socket, frame)) {
      return true
    }
    const payload = decodeRuntimeOrpcTextFrame(frame)
    if (payload === null) {
      return false
    }
    const peer = this.peer(socket)
    void this.handler
      .message(peer, payload, { context: this.context(socket) })
      .catch(() => socket.ws.close(1003, 'Invalid oRPC peer message'))
    return true
  }

  handleBinary(socket: AuthenticatedMobileSocket, frame: Uint8Array<ArrayBufferLike>): boolean {
    if (this.shellServices.handleBinary(socket, frame)) {
      return true
    }
    const payload = decodeRuntimeOrpcBinaryFrame(frame)
    if (payload === null) {
      return false
    }
    const peer = this.peer(socket)
    void this.handler
      .message(peer, arrayBufferOf(payload), { context: this.context(socket) })
      .catch(() => socket.ws.close(1003, 'Invalid oRPC peer message'))
    return true
  }

  close(socket: AuthenticatedMobileSocket): void {
    this.shellServices.close(socket)
    const peer = this.peers.get(socket.ws)
    if (!peer) {
      return
    }
    this.handler.close(peer)
    peer.close()
    this.peers.delete(socket.ws)
  }

  private peer(socket: AuthenticatedMobileSocket): EncryptedOrpcPeer {
    let peer = this.peers.get(socket.ws)
    if (!peer) {
      peer = new EncryptedOrpcPeer(() => socket.ws.close(1013, 'oRPC send failed'))
      this.peers.set(socket.ws, peer)
    }
    peer.update(socket.sendText, socket.sendBinary)
    return peer
  }

  private context(socket: AuthenticatedMobileSocket): ReturnType<typeof createRuntimeOrpcContext> {
    const principal = {
      kind: 'paired-device',
      deviceId: socket.device.deviceId,
      scope: socket.device.scope
    } as const
    return createRuntimeOrpcContext(this.options.runtime, {
      connectionId: socket.connectionId,
      shellConnectionId:
        socket.shellConnectionId ?? webShellServicesConnectionId(socket.connectionId),
      renderingWebContentsId: socket.renderingWebContentsId,
      clientId: socket.device.deviceToken,
      clientKind: socket.device.scope === 'mobile' ? 'mobile' : 'runtime',
      principal,
      authenticatedCallerFingerprint: authenticatedTokenFingerprint(socket.device.deviceToken),
      resolveAdmission: () => {
        const admission = this.options.resolveAdmission(socket)
        if (!admission) {
          throw new ORPCError('unauthorized', {
            status: 401,
            message: translateMain(
              'runtimeHost.pairedDeviceUnauthorized',
              'The paired device is no longer authorized'
            )
          })
        }
        return admission
      },
      beforeInvocation: async (invocation) => {
        const lease = await this.options.beforeInvocation(socket, invocation)
        if (lease?.denial) {
          throw new ORPCError(lease.denial.code, {
            status: lease.denial.status,
            message: lease.denial.message
          })
        }
        return lease?.release
      },
      sendBinary: socket.sendBinary,
      registerBinaryStreamHandler: (streamId, handler) =>
        this.options.registerBinaryStreamHandler(socket.connectionId, streamId, handler),
      openTerminalMultiplex: this.options.openTerminalMultiplex
        ? (input) => this.options.openTerminalMultiplex!(socket, input)
        : undefined,
      activateTerminalMultiplexEpoch: this.options.activateTerminalMultiplexEpoch
        ? () => this.options.activateTerminalMultiplexEpoch!(socket)
        : undefined,
      closeTerminalMultiplexConnection: (code, reason) => socket.ws.close(code, reason),
      terminalMultiplexQueueBytes: () => socket.ws.bufferedAmount
    })
  }
}

class EncryptedOrpcPeer {
  private sendText: SendText = () => {}
  private sendBinary: SendBinary = () => false
  private sendQueue = Promise.resolve()

  readonly addEventListener: MinimalWebsocket['addEventListener'] = () => {}
  readonly send: MinimalWebsocket['send'] = (data) => {
    this.sendQueue = this.sendQueue
      .then(() => this.sendFrame(data))
      .catch(() => this.onSendFailure())
  }

  constructor(private readonly onSendFailure: () => void) {}

  update(sendText: SendText, sendBinary: SendBinary): void {
    this.sendText = sendText
    this.sendBinary = sendBinary
  }

  close(): void {
    this.sendText = () => {}
    this.sendBinary = () => false
  }

  private async sendFrame(
    data: string | ArrayBufferLike | Blob | ArrayBufferView<ArrayBufferLike>
  ): Promise<void> {
    if (typeof data === 'string') {
      this.sendText(encodeRuntimeOrpcTextFrame(data))
      return
    }
    const payload = await websocketDataBytes(data)
    if (this.sendBinary(encodeRuntimeOrpcBinaryFrame(payload)) === false) {
      throw new Error('Encrypted oRPC peer is not writable')
    }
  }
}

async function websocketDataBytes(
  data: ArrayBufferLike | Blob | ArrayBufferView<ArrayBufferLike>
): Promise<Uint8Array<ArrayBufferLike>> {
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer())
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }
  return new Uint8Array(data)
}

function arrayBufferOf(bytes: Uint8Array<ArrayBufferLike>): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}
