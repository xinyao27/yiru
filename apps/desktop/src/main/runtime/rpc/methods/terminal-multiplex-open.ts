import { TERMINAL_MULTIPLEX_RUNTIME_CAPABILITY } from '@yiru/runtime-protocol/capabilities'
import type {
  TerminalOpenMultiplexInput,
  TerminalOpenMultiplexResult
} from '@yiru/runtime-protocol/contract'

import { RuntimeRpcHandlerError, type RpcContext } from '../core'

export function assertTerminalMultiplexAdvertised(context: RpcContext): void {
  if (
    context.allowUnadvertisedTerminalMultiplex !== true &&
    !context.runtime.getStatus().capabilities?.includes(TERMINAL_MULTIPLEX_RUNTIME_CAPABILITY)
  ) {
    throw new RuntimeRpcHandlerError(
      'capability_unsupported',
      'Terminal multiplex is unavailable until its release gates are complete.'
    )
  }
}

export function handleTerminalOpenMultiplex(
  input: TerminalOpenMultiplexInput,
  context: RpcContext
): TerminalOpenMultiplexResult {
  assertTerminalMultiplexAdvertised(context)
  if (!context.openTerminalMultiplex) {
    throw new Error('terminal_multiplex_unavailable')
  }
  return context.openTerminalMultiplex(input)
}
