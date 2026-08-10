import type {
  TerminalManagementKillAllResult,
  TerminalManagementKillOneResult,
  TerminalManagementListResult,
  TerminalManagementRestartResult
} from '@yiru/runtime-protocol/contract'
import type { GlobalSettings } from '~shared/types'

import { callRuntimeOrpc } from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'

type RuntimeSettings = Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined

// Why: killAll polls the daemon past its SIGTERM→SIGKILL ladder (~6.5s), so it
// needs a window well beyond the default call timeout.
const KILL_ALL_TIMEOUT_MS = 30_000

export async function listRuntimeDaemonSessions(
  settings?: RuntimeSettings
): Promise<TerminalManagementListResult> {
  return callRuntimeOrpc(
    getActiveRuntimeTarget(settings),
    (client) => client.terminal.management.listSessions,
    {}
  )
}

export async function killAllRuntimeDaemonSessions(
  settings?: RuntimeSettings
): Promise<TerminalManagementKillAllResult> {
  return callRuntimeOrpc(
    getActiveRuntimeTarget(settings),
    (client) => client.terminal.management.killAll,
    {},
    { timeoutMs: KILL_ALL_TIMEOUT_MS }
  )
}

export async function killRuntimeDaemonSession(
  sessionId: string,
  settings?: RuntimeSettings
): Promise<TerminalManagementKillOneResult> {
  return callRuntimeOrpc(
    getActiveRuntimeTarget(settings),
    (client) => client.terminal.management.killOne,
    { sessionId }
  )
}

export async function restartRuntimeDaemon(
  settings?: RuntimeSettings
): Promise<TerminalManagementRestartResult> {
  return callRuntimeOrpc(
    getActiveRuntimeTarget(settings),
    (client) => client.terminal.management.restart,
    {}
  )
}
