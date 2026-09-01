import type { TerminalOpenMultiplexResult } from '@yiru/runtime-protocol/contract'
import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import { TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES } from '@yiru/runtime-protocol/terminal-multiplex/frame'
import { openConfiguredBrowserHostTerminalMultiplex } from '~renderer/runtime/browser-host-runtime'
import type { RuntimeClientTarget } from '~renderer/runtime/orpc-client'

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
  return openConfiguredBrowserHostTerminalMultiplex({
    environmentIdentity: options.environmentIdentity,
    onBinary: options.onBinary,
    onClose: options.onClose,
    onError: options.onError,
    onResponse: options.onResponse,
    ticket
  })
}

function createClientInstanceId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}
