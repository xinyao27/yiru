import type {
  TerminalMultiplexEvent,
  TerminalMultiplexInput
} from '@yiru/runtime-protocol/contract'
import { TerminalMultiplexSession } from '~main/runtime/terminal-multiplex/session/session'

import type { RpcContext } from '../core'
import { assertTerminalMultiplexAdvertised } from './terminal-multiplex-open'

export async function handleTerminalMultiplex(
  _input: TerminalMultiplexInput,
  context: RpcContext,
  emit: (event: TerminalMultiplexEvent) => void
): Promise<void> {
  assertTerminalMultiplexAdvertised(context)
  await new TerminalMultiplexSession(context, emit).run()
}
