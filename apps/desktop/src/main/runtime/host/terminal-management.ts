import type {
  TerminalManagementKillAllResult,
  TerminalManagementKillOneInput,
  TerminalManagementKillOneResult,
  TerminalManagementListResult,
  TerminalManagementRestartResult
} from '@yiru/runtime-protocol/contract'
import type { DaemonPtyAdapter } from '~main/daemon/pty-adapter'

const MAX_KILL_POLL_ATTEMPTS = 65
const KILL_POLL_INTERVAL_MS = 100

let daemonAdapter: DaemonPtyAdapter | null = null
let restartDaemon: (() => Promise<void>) | null = null

export function setNodeRuntimeHostTerminalManagementAdapter(
  adapter: DaemonPtyAdapter | null,
  restart: (() => Promise<void>) | null = null
): void {
  daemonAdapter = adapter
  restartDaemon = restart
}

export async function listNodeRuntimeHostDaemonSessions(): Promise<TerminalManagementListResult> {
  const adapter = requireDaemonAdapter()
  const sessions = await adapter.listSessions()
  return {
    degraded: false,
    sessions: sessions.map((session) => ({
      ...session,
      protocolVersion: adapter.protocolVersion
    }))
  }
}

export async function killAllNodeRuntimeHostDaemonSessions(): Promise<TerminalManagementKillAllResult> {
  const adapter = requireDaemonAdapter()
  const initial = await adapter.listSessions()
  const initialIds = new Set(initial.map((session) => session.sessionId))
  if (initialIds.size === 0) {
    return { killedCount: 0, remainingCount: 0, killedSessionIds: [] }
  }

  await Promise.allSettled(
    [...initialIds].map((sessionId) =>
      adapter.shutdown(sessionId, { immediate: true }).catch(() => {})
    )
  )

  let remainingIds = initialIds
  for (let attempt = 0; attempt < MAX_KILL_POLL_ATTEMPTS; attempt += 1) {
    await sleep(KILL_POLL_INTERVAL_MS)
    const sessions = await adapter.listSessions()
    remainingIds = new Set(
      sessions.map((session) => session.sessionId).filter((sessionId) => initialIds.has(sessionId))
    )
    if (remainingIds.size === 0) {
      break
    }
  }

  return {
    killedCount: initialIds.size - remainingIds.size,
    remainingCount: remainingIds.size,
    killedSessionIds: [...initialIds].filter((sessionId) => !remainingIds.has(sessionId))
  }
}

export async function killNodeRuntimeHostDaemonSession(
  params: TerminalManagementKillOneInput
): Promise<TerminalManagementKillOneResult> {
  const adapter = requireDaemonAdapter()
  const sessions = await adapter.listSessions()
  if (!sessions.some((session) => session.sessionId === params.sessionId)) {
    return { success: false }
  }
  try {
    await adapter.shutdown(params.sessionId, { immediate: true })
    return { success: true }
  } catch {
    return { success: false }
  }
}

export async function restartNodeRuntimeHostDaemon(): Promise<TerminalManagementRestartResult> {
  const adapter = requireDaemonAdapter()
  if (!restartDaemon) {
    throw new Error('runtime_host_pty_daemon_restart_unavailable')
  }
  try {
    // Why: the in-process daemon suppresses exit fanout while it tears down all
    // sessions. Notify runtime owners before disconnecting so no pane retains a dead PTY.
    adapter.fanoutSyntheticExits(-1)
    await adapter.disconnectOnly()
    await restartDaemon()
    await adapter.listSessions()
    return { success: true }
  } catch (error) {
    console.error('[runtime-host] PTY daemon restart failed:', error)
    return { success: false }
  }
}

function requireDaemonAdapter(): DaemonPtyAdapter {
  if (!daemonAdapter) {
    throw new Error('runtime_host_pty_daemon_unavailable')
  }
  return daemonAdapter
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
