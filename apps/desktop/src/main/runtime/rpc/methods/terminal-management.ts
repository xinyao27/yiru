import type {
  TerminalManagementKillAllResult,
  TerminalManagementKillOneInput,
  TerminalManagementKillOneResult,
  TerminalManagementListResult,
  TerminalManagementRestartResult
} from '@yiru/runtime-protocol/contract'
import {
  killAllDaemonSessions,
  killDaemonSession,
  listDaemonSessions,
  restartPtyDaemon
} from '~main/pty/management'

export async function listRuntimeDaemonSessions(): Promise<TerminalManagementListResult> {
  return await listDaemonSessions()
}

export async function killAllRuntimeDaemonSessions(): Promise<TerminalManagementKillAllResult> {
  return await killAllDaemonSessions()
}

export async function killRuntimeDaemonSession(
  params: TerminalManagementKillOneInput
): Promise<TerminalManagementKillOneResult> {
  return await killDaemonSession(params.sessionId)
}

export async function restartRuntimeDaemon(): Promise<TerminalManagementRestartResult> {
  return await restartPtyDaemon()
}
