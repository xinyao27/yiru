import { handleTerminalMultiplex } from '~main/runtime/rpc/methods/terminal-multiplex'
import { handleTerminalOpenMultiplex } from '~main/runtime/rpc/methods/terminal-multiplex-open'
import { handleTerminalSend } from '~main/runtime/rpc/methods/terminal-send-method'
import { handleTerminalSubscribeRetired } from '~main/runtime/rpc/methods/terminal-subscribe-retired'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'
import { wireRuntimeStream } from '../registered-stream'

// Why: the ticket opener and long-lived multiplex procedure share one router
// seam so exclusive dedicated-connection admission is visible beside both
// entry points. `subscribe` remains only as an explicit fail-closed method
// until the mobile client moves to multiplex; it contains no retired decoder.
export function terminalStreamLeaves() {
  return {
    openMultiplex: runtimeImplementation.terminal.openMultiplex.handler(
      wireRuntimeMethod('terminal.openMultiplex', handleTerminalOpenMultiplex)
    ),
    multiplex: runtimeImplementation.terminal.multiplex.handler(
      wireRuntimeStream('terminal.multiplex', handleTerminalMultiplex)
    ),
    subscribe: runtimeImplementation.terminal.subscribe.handler(
      wireRuntimeStream('terminal.subscribe', handleTerminalSubscribeRetired)
    ),
    send: runtimeImplementation.terminal.send.handler(
      wireRuntimeMethod('terminal.send', handleTerminalSend)
    )
  }
}
