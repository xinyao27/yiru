import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { connect } from 'node:net'

import { DaemonClient } from './client'
import { killStaleDaemon, parseDaemonPidFile } from './health'
import { DaemonPtyAdapter } from './pty-adapter'
import { getDaemonHistoryDir } from './runtime-paths'
import { getDaemonPidPath, getDaemonSocketPath, getDaemonTokenPath } from './spawner'
import { PREVIOUS_DAEMON_PROTOCOL_VERSIONS, type ListSessionsResult } from './types'

export type OrphanedDaemonCleanupResult = {
  cleaned: boolean
  killedCount: number
}

export function probeDaemonSocket(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (process.platform !== 'win32' && !existsSync(socketPath)) {
      resolve(false)
      return
    }
    const socket = connect({ path: socketPath })
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    const finish = (alive: boolean, shouldDestroy = false): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      socket.removeListener('connect', onConnect)
      socket.removeListener('error', onError)
      if (shouldDestroy) {
        socket.destroy()
      }
      resolve(alive)
    }
    const onConnect = (): void => finish(true, true)
    const onError = (): void => finish(false)
    timer = setTimeout(() => finish(false, true), 1000)
    socket.on('connect', onConnect)
    socket.on('error', onError)
  })
}

export async function cleanupDaemonForProtocol(
  runtimeDir: string,
  protocolVersion: number
): Promise<OrphanedDaemonCleanupResult> {
  const socketPath = getDaemonSocketPath(runtimeDir, protocolVersion)
  const tokenPath = getDaemonTokenPath(runtimeDir, protocolVersion)
  const pidPath = getDaemonPidPath(runtimeDir, protocolVersion)
  if (!(await probeDaemonSocket(socketPath))) {
    removeStaleSocket(socketPath)
    removeFile(pidPath)
    return { cleaned: false, killedCount: 0 }
  }

  const client = new DaemonClient({ socketPath, tokenPath, protocolVersion })
  let killedCount = 0
  let didRequestShutdown = false
  let didKillStaleDaemon = false
  try {
    await client.ensureConnected()
    const sessions = await client
      .request<ListSessionsResult>('listSessions', undefined)
      .catch(() => ({ sessions: [] }))
    killedCount = sessions.sessions.filter((session) => session.isAlive).length
    await client.request('shutdown', { killSessions: true }).catch(() => undefined)
    didRequestShutdown = true
  } catch {
    didKillStaleDaemon = await killStaleDaemon(runtimeDir, socketPath, tokenPath, protocolVersion)
  } finally {
    client.disconnect()
  }
  if (didRequestShutdown) {
    removeStaleSocket(socketPath)
  }
  removeFile(pidPath)
  return { cleaned: didRequestShutdown || didKillStaleDaemon, killedCount }
}

export async function createLegacyDaemonAdapters(runtimeDir: string): Promise<DaemonPtyAdapter[]> {
  const adapters: DaemonPtyAdapter[] = []
  for (const protocolVersion of PREVIOUS_DAEMON_PROTOCOL_VERSIONS) {
    const socketPath = getDaemonSocketPath(runtimeDir, protocolVersion)
    const tokenPath = getDaemonTokenPath(runtimeDir, protocolVersion)
    if (!(await probeDaemonSocket(socketPath))) {
      if (!legacyDaemonProcessMayBeAlive(runtimeDir, protocolVersion)) {
        removeFile(getDaemonPidPath(runtimeDir, protocolVersion))
        removeFile(getDaemonTokenPath(runtimeDir, protocolVersion))
        removeStaleSocket(socketPath)
      }
      continue
    }
    // Why: live old-protocol PTYs must remain attached across an app upgrade.
    adapters.push(
      new DaemonPtyAdapter({
        socketPath,
        tokenPath,
        protocolVersion,
        historyPath: getDaemonHistoryDir()
      })
    )
  }
  return adapters
}

function legacyDaemonProcessMayBeAlive(runtimeDir: string, protocolVersion: number): boolean {
  try {
    const parsed = parseDaemonPidFile(
      readFileSync(getDaemonPidPath(runtimeDir, protocolVersion), 'utf8')
    )
    if (!parsed) {
      return false
    }
    process.kill(parsed.pid, 0)
    return true
  } catch {
    return false
  }
}

function removeStaleSocket(socketPath: string): void {
  if (process.platform !== 'win32' && existsSync(socketPath)) {
    removeFile(socketPath)
  }
}

function removeFile(path: string): void {
  try {
    unlinkSync(path)
  } catch {
    // Best-effort cleanup.
  }
}
