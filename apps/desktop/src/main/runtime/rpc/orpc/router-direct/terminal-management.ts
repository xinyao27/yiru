import {
  killAllRuntimeDaemonSessions,
  killRuntimeDaemonSession,
  listRuntimeDaemonSessions,
  restartRuntimeDaemon
} from '~main/runtime/rpc/methods/terminal-management'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: `terminal.management.*` is a nested sub-router under the top-level `terminal`
// contract key, not a sibling top-level key of its own — it must be assembled inside
// terminal.ts's `management: {...}` object, never spread alongside `terminal`'s other
// leaves. Previously this stayed dual-registered (methods/terminal-management.ts)
// purely because it is structurally nested under `terminal`, which stayed fully
// bridged for the `terminal.multiplex` binary-stream gap — not because any of its four
// leaves has a bare-string caller of its own. `daemon-sessions-client.ts` is the only
// real caller, reaching every leaf through `client.terminal.management.X` property
// access on the negotiated oRPC client, so all four retire from the legacy registry now
// that `terminal` itself is direct-wired.
export function terminalManagementLeaves() {
  return {
    listSessions: runtimeImplementation.terminal.management.listSessions.handler(
      wireRuntimeMethod('terminal.management.listSessions', listRuntimeDaemonSessions)
    ),
    killAll: runtimeImplementation.terminal.management.killAll.handler(
      wireRuntimeMethod('terminal.management.killAll', killAllRuntimeDaemonSessions)
    ),
    killOne: runtimeImplementation.terminal.management.killOne.handler(
      wireRuntimeMethod('terminal.management.killOne', killRuntimeDaemonSession)
    ),
    restart: runtimeImplementation.terminal.management.restart.handler(
      wireRuntimeMethod('terminal.management.restart', restartRuntimeDaemon)
    )
  }
}
