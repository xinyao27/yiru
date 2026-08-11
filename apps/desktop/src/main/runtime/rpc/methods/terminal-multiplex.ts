import type {
  TerminalMultiplexEvent,
  TerminalMultiplexInput
} from '@yiru/runtime-protocol/contract'
import { TerminalMultiplexSession } from '~main/runtime/terminal-multiplex/session'

import type { RpcContext } from '../core'

export async function handleTerminalMultiplex(
  _input: TerminalMultiplexInput,
  context: RpcContext,
  emit: (event: TerminalMultiplexEvent) => void
): Promise<void> {
  await new TerminalMultiplexSession(context, emit).run()
}
