import type { TerminalOpenMultiplexResult } from '@yiru/runtime-protocol/contract'
import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import { TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES } from '@yiru/runtime-protocol/terminal-multiplex/frame'

export type RuntimeEnvironmentSubscriptionHandle = {
  unsubscribe: () => void
  sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => void
}

type OpenRemoteTerminalMultiplexOptions = {
  environmentId: string
  callRuntime: (method: string, params: unknown) => Promise<TerminalOpenMultiplexResult>
  onResponse: (response: RuntimeRpcResponse<unknown>) => void
  onBinary: (bytes: Uint8Array<ArrayBufferLike>) => void
  onError: (error: Error) => void
  onClose: () => void
}

const CLIENT_INSTANCE_ID = createClientInstanceId()

export async function openRemoteTerminalMultiplexSubscription(
  options: OpenRemoteTerminalMultiplexOptions
): Promise<RuntimeEnvironmentSubscriptionHandle> {
  const ticket = await options.callRuntime('terminal.openMultiplex', {
    environmentId: options.environmentId,
    clientInstanceId: CLIENT_INSTANCE_ID
  })
  if (
    ticket.expiresAt <= Date.now() ||
    ticket.maxFrameBytes !== TERMINAL_MULTIPLEX_DEFAULT_MAX_FRAME_BYTES
  ) {
    throw new Error('Runtime host returned an invalid terminal bulk ticket.')
  }
  // Why: the environment transport already owns the authenticated endpoint.
  // The diagnostic endpoint cannot replace its pairing and E2EE key schedule.
  return window.api.runtimeEnvironments.subscribe(
    {
      selector: options.environmentId,
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

function createClientInstanceId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}
