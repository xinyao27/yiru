import {
  handleTerminalAgentStatus,
  handleTerminalInspectProcess,
  handleTerminalIsRunningAgent,
  handleTerminalList,
  handleTerminalRead,
  handleTerminalResolveActive,
  handleTerminalResolvePane,
  handleTerminalShow,
  handleTerminalWait
} from '~main/runtime/rpc/methods/terminal-read-methods'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: the read-only half of the top-level `terminal` contract key — split out of
// terminal.ts (orpc/router-direct/terminal.ts) the same way browser.ts splits its 83
// leaves, since `terminal` has 33 leaves across five feature areas. None of these nine
// ever had a bare-string caller (every real call site uses `callRuntimeOrpc`/property
// access into the negotiated client), so this file has no legacy twin to note.
export function terminalReadLeaves() {
  return {
    list: runtimeImplementation.terminal.list.handler(
      wireRuntimeMethod('terminal.list', handleTerminalList)
    ),
    resolveActive: runtimeImplementation.terminal.resolveActive.handler(
      wireRuntimeMethod('terminal.resolveActive', handleTerminalResolveActive)
    ),
    resolvePane: runtimeImplementation.terminal.resolvePane.handler(
      wireRuntimeMethod('terminal.resolvePane', handleTerminalResolvePane)
    ),
    show: runtimeImplementation.terminal.show.handler(
      wireRuntimeMethod('terminal.show', handleTerminalShow)
    ),
    read: runtimeImplementation.terminal.read.handler(
      wireRuntimeMethod('terminal.read', handleTerminalRead)
    ),
    inspectProcess: runtimeImplementation.terminal.inspectProcess.handler(
      wireRuntimeMethod('terminal.inspectProcess', handleTerminalInspectProcess)
    ),
    isRunningAgent: runtimeImplementation.terminal.isRunningAgent.handler(
      wireRuntimeMethod('terminal.isRunningAgent', handleTerminalIsRunningAgent)
    ),
    agentStatus: runtimeImplementation.terminal.agentStatus.handler(
      wireRuntimeMethod('terminal.agentStatus', handleTerminalAgentStatus)
    ),
    wait: runtimeImplementation.terminal.wait.handler(
      wireRuntimeMethod('terminal.wait', handleTerminalWait)
    )
  }
}
