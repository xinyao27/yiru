import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'
import { DaemonClient } from './client'
import {
  checkDaemonHealth,
  getDaemonLaunchIdentity,
  getMacDaemonSystemResolverHealth,
  isDaemonStaleForCurrentBundle,
  killStaleDaemon
} from './health'
import { cleanupDaemonForProtocol, probeDaemonSocket } from './process-cleanup'
import { spawnDaemonProcess } from './process-spawn'
import type { DaemonRuntimeHostOptions } from './runtime-host-options'
import { getDaemonEntryPath } from './runtime-paths'
import type { DaemonLauncher, DaemonProcessHandle } from './spawner'
import { PROTOCOL_VERSION, type ListSessionsResult } from './types'

export const WEDGED_DAEMON_GRACE_RETRIES = 11

export function createOutOfProcessLauncher(
  runtimeDir: string,
  host: DaemonRuntimeHostOptions
): DaemonLauncher {
  return async (socketPath, tokenPath) => {
    const entryPath = getDaemonEntryPath()
    const health = await checkDaemonHealth(socketPath, tokenPath)
    if (health === 'healthy') {
      const preserved = await adoptHealthyDaemon({
        entryPath,
        runtimeDir,
        socketPath,
        tokenPath
      })
      if (preserved) {
        return preserved
      }
    } else {
      const preserved = await adoptUnhealthyDaemon({
        health,
        runtimeDir,
        socketPath,
        tokenPath
      })
      if (preserved) {
        return preserved
      }
    }
    await killStaleDaemon(runtimeDir, socketPath, tokenPath)
    return spawnDaemonProcess({ entryPath, host, runtimeDir, socketPath, tokenPath })
  }
}

async function adoptHealthyDaemon(options: {
  entryPath: string
  runtimeDir: string
  socketPath: string
  tokenPath: string
}): Promise<DaemonProcessHandle | null> {
  const resolverHealth = await getMacDaemonSystemResolverHealth(
    options.socketPath,
    options.tokenPath
  )
  if (resolverHealth === 'unhealthy') {
    const liveSessionCount = await getAliveDaemonSessionCount(options.socketPath, options.tokenPath)
    if (liveSessionCount !== 0) {
      warnPreservedDaemon(liveSessionCount, 'with unavailable macOS system resolver')
      return createPreservedDaemonHandle(options.runtimeDir)
    }
    console.warn('[daemon] Replacing daemon with unavailable macOS system resolver')
    await cleanupDaemonForProtocol(options.runtimeDir, PROTOCOL_VERSION)
    return null
  }

  const pathsProvider = getRuntimeHostPathsProvider()
  const identity = await getDaemonLaunchIdentity(
    options.runtimeDir,
    options.socketPath,
    options.tokenPath,
    options.entryPath
  )
  const isStaleBundle =
    pathsProvider.isPackaged() &&
    (await isDaemonStaleForCurrentBundle(
      options.runtimeDir,
      options.socketPath,
      options.tokenPath,
      pathsProvider.version()
    ))
  if (identity !== 'mismatch' && !isStaleBundle) {
    return createPreservedDaemonHandle(options.runtimeDir)
  }
  const replacementLabel = isStaleBundle
    ? 'launched before the current app bundle was installed'
    : 'launched from a different app path'
  const liveSessionCount = await getAliveDaemonSessionCount(options.socketPath, options.tokenPath)
  if (liveSessionCount !== 0) {
    warnPreservedDaemon(liveSessionCount, replacementLabel)
    return createPreservedDaemonHandle(options.runtimeDir)
  }
  console.warn(`[daemon] Replacing daemon ${replacementLabel}`)
  await cleanupDaemonForProtocol(options.runtimeDir, PROTOCOL_VERSION)
  return null
}

async function adoptUnhealthyDaemon(options: {
  health: Awaited<ReturnType<typeof checkDaemonHealth>>
  runtimeDir: string
  socketPath: string
  tokenPath: string
}): Promise<DaemonProcessHandle | null> {
  let liveSessionCount = await getAliveDaemonSessionCount(options.socketPath, options.tokenPath)
  let graceRetry = 0
  while (
    liveSessionCount === null &&
    options.health !== 'rejected' &&
    graceRetry < WEDGED_DAEMON_GRACE_RETRIES &&
    (await probeDaemonSocket(options.socketPath))
  ) {
    liveSessionCount = await getAliveDaemonSessionCount(options.socketPath, options.tokenPath)
    graceRetry++
  }
  if (liveSessionCount === null || liveSessionCount === 0) {
    return null
  }
  if (options.health === 'pty-spawn-unhealthy') {
    console.warn(
      `[daemon] DEGRADED MODE: preserving daemon that failed the PTY spawn health check because it owns ${liveSessionCount} live session${pluralSuffix(liveSessionCount)}. Existing sessions keep working; fresh terminals run on the local provider WITHOUT daemon persistence until you restart the daemon (Manage Sessions → Restart).`
    )
    return createPreservedDaemonHandle(
      options.runtimeDir,
      PROTOCOL_VERSION,
      'degraded-new-pty-fallback'
    )
  }
  warnPreservedDaemon(liveSessionCount, 'that failed the health check')
  return createPreservedDaemonHandle(options.runtimeDir)
}

async function getAliveDaemonSessionCount(
  socketPath: string,
  tokenPath: string,
  protocolVersion = PROTOCOL_VERSION
): Promise<number | null> {
  const client = new DaemonClient({ socketPath, tokenPath, protocolVersion })
  try {
    await client.ensureConnected()
    const result = await client.request<ListSessionsResult>('listSessions', undefined)
    return result.sessions.filter((session) => session.isAlive).length
  } catch {
    return null
  } finally {
    client.disconnect()
  }
}

function createPreservedDaemonHandle(
  runtimeDir: string,
  protocolVersion = PROTOCOL_VERSION,
  mode?: 'degraded-new-pty-fallback'
): DaemonProcessHandle {
  const handle: DaemonProcessHandle = {
    shutdown: async () => {
      await cleanupDaemonForProtocol(runtimeDir, protocolVersion)
    }
  }
  if (mode) {
    handle.mode = mode
  }
  return handle
}

function warnPreservedDaemon(liveSessionCount: number | null, reason: string): void {
  console.warn(
    liveSessionCount === null
      ? `[daemon] Preserving daemon ${reason} because live session state could not be verified`
      : `[daemon] Preserving daemon ${reason} because it owns ${liveSessionCount} live session${pluralSuffix(liveSessionCount)}`
  )
}

function pluralSuffix(count: number): string {
  return count === 1 ? '' : 's'
}
