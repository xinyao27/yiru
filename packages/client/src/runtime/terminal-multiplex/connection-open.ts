import type { TerminalOpenMultiplexResult } from '@yiru/runtime-protocol/contract'
import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import { TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES } from '@yiru/runtime-protocol/terminal-multiplex/frame'

import {
  openWebTerminalMultiplexSubscription,
  type WebTerminalMultiplexSubscription
} from '../../web/terminal-multiplex-subscription'
import type { RuntimeClientTarget } from '../orpc-client'
import {
  openAuthenticatedRuntimeLoopbackSocket,
  runtimeLoopbackEventBytes,
  sendRuntimeLoopbackSocketFrame
} from '../orpc-loopback-socket'
import { runtimeEnvironmentsClient } from '../runtime-environments-client'

export type RuntimeTerminalMultiplexHandle = {
  unsubscribe: () => void
  sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => void
}

type OpenTerminalMultiplexOptions = {
  target: RuntimeClientTarget
  environmentIdentity: string
  callRuntime: (method: string, params: unknown) => Promise<TerminalOpenMultiplexResult>
  onResponse: (response: RuntimeRpcResponse<unknown>) => void
  onBinary: (bytes: Uint8Array<ArrayBufferLike>) => void
  onError: (error: Error) => void
  onClose: () => void
}

const CLIENT_INSTANCE_ID = createClientInstanceId()

export async function openTerminalMultiplexSubscription(
  options: OpenTerminalMultiplexOptions
): Promise<RuntimeTerminalMultiplexHandle> {
  const ticket = await options.callRuntime('terminal.openMultiplex', {
    environmentId: options.environmentIdentity,
    clientInstanceId: CLIENT_INSTANCE_ID
  })
  if (
    !ticket.bulkTicket ||
    !ticket.bulkEndpoint ||
    ticket.expiresAt <= Date.now() ||
    ticket.maxFrameBytes !== TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES
  ) {
    throw new Error('Runtime host returned an invalid terminal bulk ticket.')
  }
  if (isWebRuntimeClient()) {
    return openWebRuntimeTerminalMultiplex(options, ticket)
  }
  return openLoopbackRuntimeTerminalMultiplex(options, ticket)
}

async function openLoopbackRuntimeTerminalMultiplex(
  options: OpenTerminalMultiplexOptions,
  ticket: TerminalOpenMultiplexResult
): Promise<RuntimeTerminalMultiplexHandle> {
  const target =
    options.target.kind === 'local'
      ? ({ kind: 'local' } as const)
      : ({
          kind: 'environment',
          environmentId: options.target.environmentId,
          timeoutMs: 15_000
        } as const)
  const ws = await openAuthenticatedRuntimeLoopbackSocket(target)
  const requestId = crypto.randomUUID()
  let subscription: WebTerminalMultiplexSubscription | null = null
  let intentionallyClosed = false
  const onMessage = (event: MessageEvent<unknown>): void => {
    const accepted =
      typeof event.data === 'string'
        ? subscription?.receiveText(event.data)
        : receiveLoopbackBinary(subscription, event.data)
    if (!accepted) {
      ws.close()
    }
  }
  ws.addEventListener('message', onMessage)
  ws.addEventListener(
    'close',
    () => {
      ws.removeEventListener('message', onMessage)
      if (!intentionallyClosed) {
        subscription?.transportClosed()
      }
    },
    { once: true }
  )
  subscription = await openWebTerminalMultiplexSubscription({
    requestId,
    params: { bulkTicket: ticket.bulkTicket },
    runtimeId: options.environmentIdentity,
    callbacks: {
      onResponse: options.onResponse,
      onBinary: options.onBinary,
      onError: (error) => options.onError(new Error(error.message)),
      onClose: options.onClose
    },
    sendText: (frame) => sendRuntimeLoopbackSocketFrame(ws, frame),
    sendBinary: (frame) => sendRuntimeLoopbackSocketFrame(ws, frame),
    onCreated: (created) => {
      subscription = created
    }
  })
  return {
    unsubscribe: () => {
      intentionallyClosed = true
      subscription?.close()
      ws.close()
    },
    sendBinary: (bytes) => subscription?.sendBinary(bytes)
  }
}

async function openWebRuntimeTerminalMultiplex(
  options: OpenTerminalMultiplexOptions,
  ticket: TerminalOpenMultiplexResult
): Promise<RuntimeTerminalMultiplexHandle> {
  if (options.target.kind !== 'environment') {
    throw new Error('The web runtime cannot open a local terminal bulk connection.')
  }
  return runtimeEnvironmentsClient.subscribe(
    {
      selector: options.target.environmentId,
      method: 'terminal.multiplex',
      params: { bulkTicket: ticket.bulkTicket },
      timeoutMs: 15_000
    },
    {
      onResponse: options.onResponse,
      onBinary: options.onBinary,
      onError: (error) => options.onError(new Error(error.message)),
      onClose: options.onClose
    }
  )
}

function receiveLoopbackBinary(
  subscription: WebTerminalMultiplexSubscription | null,
  data: unknown
): boolean {
  const bytes = runtimeLoopbackEventBytes(data)
  return bytes !== null && subscription?.receiveBinary(bytes) === true
}

function isWebRuntimeClient(): boolean {
  return (globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__ === true
}

function createClientInstanceId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}
