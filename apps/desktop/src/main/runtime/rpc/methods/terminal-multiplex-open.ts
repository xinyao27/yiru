import type {
  TerminalOpenMultiplexInput,
  TerminalOpenMultiplexResult
} from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'

export function handleTerminalOpenMultiplex(
  input: TerminalOpenMultiplexInput,
  context: RpcContext
): TerminalOpenMultiplexResult {
  if (!context.openTerminalMultiplex) {
    throw new Error('terminal_multiplex_unavailable')
  }
  return context.openTerminalMultiplex(input)
}
