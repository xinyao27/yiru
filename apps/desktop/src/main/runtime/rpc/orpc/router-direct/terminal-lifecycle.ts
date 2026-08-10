import {
  handleTerminalClearBuffer,
  handleTerminalClose,
  handleTerminalCloseTab,
  handleTerminalCreate,
  handleTerminalFocus,
  handleTerminalRename,
  handleTerminalSplit,
  handleTerminalStop,
  handleTerminalStopExact
} from '~main/runtime/rpc/methods/terminal-lifecycle-methods'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: the create/rename/close half of `terminal` — split out for the same 300-line-cap
// reason as terminal-read.ts. None of these nine leaves ever had a bare-string caller;
// every real call site (desktop renderer's `remote-runtime-pty-transport.ts`, mobile's
// `session/tab-activation.ts`) reaches them through `callRuntimeOrpc`/property access on
// the negotiated client, never `window.api.runtimeEnvironments.call` with a literal name.
export function terminalLifecycleLeaves() {
  return {
    rename: runtimeImplementation.terminal.rename.handler(
      wireRuntimeMethod('terminal.rename', handleTerminalRename)
    ),
    clearBuffer: runtimeImplementation.terminal.clearBuffer.handler(
      wireRuntimeMethod('terminal.clearBuffer', handleTerminalClearBuffer)
    ),
    create: runtimeImplementation.terminal.create.handler(
      wireRuntimeMethod('terminal.create', handleTerminalCreate)
    ),
    split: runtimeImplementation.terminal.split.handler(
      wireRuntimeMethod('terminal.split', handleTerminalSplit)
    ),
    stop: runtimeImplementation.terminal.stop.handler(
      wireRuntimeMethod('terminal.stop', handleTerminalStop)
    ),
    stopExact: runtimeImplementation.terminal.stopExact.handler(
      wireRuntimeMethod('terminal.stopExact', handleTerminalStopExact)
    ),
    focus: runtimeImplementation.terminal.focus.handler(
      wireRuntimeMethod('terminal.focus', handleTerminalFocus)
    ),
    close: runtimeImplementation.terminal.close.handler(
      wireRuntimeMethod('terminal.close', handleTerminalClose)
    ),
    closeTab: runtimeImplementation.terminal.closeTab.handler(
      wireRuntimeMethod('terminal.closeTab', handleTerminalCloseTab)
    )
  }
}
