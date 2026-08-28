import { runtimeContract } from '@yiru/runtime-protocol/contract'

import { runtimeImplementation } from '../rpc/orpc/access-middleware'
import { wireRuntimeMethod } from '../rpc/orpc/registered-method'
import { terminalLifecycleLeaves } from '../rpc/orpc/router-direct/terminal-lifecycle'
import { terminalReadLeaves } from '../rpc/orpc/router-direct/terminal-read'
import { terminalStreamLeaves } from '../rpc/orpc/router-direct/terminal-stream'
import { terminalViewportLeaves } from '../rpc/orpc/router-direct/terminal-viewport'
import {
  killAllNodeRuntimeHostDaemonSessions,
  killNodeRuntimeHostDaemonSession,
  listNodeRuntimeHostDaemonSessions,
  restartNodeRuntimeHostDaemon
} from './terminal-management'

const nodeTerminalManagementHandlers = {
  listSessions: runtimeImplementation.terminal.management.listSessions.handler(
    wireRuntimeMethod('terminal.management.listSessions', listNodeRuntimeHostDaemonSessions)
  ),
  killAll: runtimeImplementation.terminal.management.killAll.handler(
    wireRuntimeMethod('terminal.management.killAll', killAllNodeRuntimeHostDaemonSessions)
  ),
  killOne: runtimeImplementation.terminal.management.killOne.handler(
    wireRuntimeMethod('terminal.management.killOne', killNodeRuntimeHostDaemonSession)
  ),
  restart: runtimeImplementation.terminal.management.restart.handler(
    wireRuntimeMethod('terminal.management.restart', restartNodeRuntimeHostDaemon)
  )
} as const

// Why: `multiplex` keeps only control events in its iterator; PTY bytes use the
// negotiated, stream-addressed binary side channel on the same authenticated
// physical connection. Remote routing keeps this method off shared-control
// pooling, and host admission rejects any socket that mixes it with other RPCs.
// A peer that does not negotiate the capability fails instead of falling back.

export const nodeTerminalRuntimeHandlers = {
  terminal: {
    ...terminalReadLeaves(),
    ...terminalLifecycleLeaves(),
    ...terminalViewportLeaves(),
    ...terminalStreamLeaves(),
    management: nodeTerminalManagementHandlers
  }
} as const

const nodeTerminalContract: Partial<typeof runtimeContract.terminal> = {
  ...runtimeContract.terminal
}
delete nodeTerminalContract.approve

export const nodeTerminalRuntimeContract = {
  terminal: nodeTerminalContract
} as const
