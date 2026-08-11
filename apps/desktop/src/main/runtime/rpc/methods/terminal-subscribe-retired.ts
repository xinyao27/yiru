import type {
  TerminalSubscribeEvent,
  TerminalSubscribeInput
} from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'

export async function handleTerminalSubscribeRetired(
  _input: TerminalSubscribeInput,
  _context: RpcContext,
  _emit: (event: TerminalSubscribeEvent) => void
): Promise<void> {
  throw new Error('terminal_multiplex_required')
}
