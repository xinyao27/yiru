import { existsSync, readFileSync, unlinkSync } from 'node:fs'

export {
  checkDaemonHealth,
  getMacDaemonSystemResolverHealth,
  type DaemonHealth
} from './health-rpc'
import { canConnectDaemonSocket } from './health-rpc'
import {
  getDaemonCommandLine,
  isDaemonProcess,
  parseDaemonPidFile,
  readVerifiedDaemonPid
} from './process-identity'
export { parseDaemonPidFile } from './process-identity'
export {
  getProcessStartedAtMs,
  parseLinuxBootTimeSeconds,
  parseLinuxProcStartTicks,
  parseWindowsProcessIdentityJson,
  startTimeMatches,
  startTimesWithinTolerance,
  type WindowsProcessIdentity
} from './process-start-time'
import { getDaemonPidPath } from './spawner'
import { PROTOCOL_VERSION } from './types'

const KILL_WAIT_MS = 3_000
const KILL_POLL_MS = 100

export type DaemonLaunchIdentity = 'match' | 'mismatch' | 'unknown'

export async function getDaemonLaunchIdentity(
  runtimeDir: string,
  socketPath: string,
  tokenPath: string,
  expectedEntryPath: string,
  protocolVersion = PROTOCOL_VERSION
): Promise<DaemonLaunchIdentity> {
  const parsedPid = await readVerifiedDaemonPid(runtimeDir, socketPath, tokenPath, protocolVersion)
  if (!parsedPid) {
    return 'unknown'
  }
  if (parsedPid.entryPath) {
    return parsedPid.entryPath === expectedEntryPath ? 'match' : 'mismatch'
  }
  // Why: legacy pid files lack entryPath. Command-line fallback prevents a dev
  // worktree from adopting a daemon from a deleted sibling checkout.
  const commandLine = await getDaemonCommandLine(parsedPid.pid)
  return commandLine ? (commandLine.includes(expectedEntryPath) ? 'match' : 'mismatch') : 'unknown'
}

export async function isDaemonStaleForCurrentBundle(
  runtimeDir: string,
  socketPath: string,
  tokenPath: string,
  currentAppVersion: string,
  protocolVersion = PROTOCOL_VERSION
): Promise<boolean> {
  const parsedPid = await readVerifiedDaemonPid(runtimeDir, socketPath, tokenPath, protocolVersion)
  if (!parsedPid) {
    return false
  }
  // Why: legacy packaged daemons have no reliable build marker. Replacing
  // them once prevents archive-preserved mtimes from reusing stale natives.
  return parsedPid.appVersion === null || parsedPid.appVersion !== currentAppVersion
}

export async function killStaleDaemon(
  runtimeDir: string,
  socketPath: string,
  tokenPath: string,
  protocolVersion = PROTOCOL_VERSION
): Promise<boolean> {
  const pidPath = getDaemonPidPath(runtimeDir, protocolVersion)
  let killedDaemon = false
  try {
    const parsedPid = parseDaemonPidFile(readFileSync(pidPath, 'utf8'))
    if (
      parsedPid &&
      (await isDaemonProcess(parsedPid.pid, socketPath, tokenPath, parsedPid.startedAtMs))
    ) {
      const { pid, startedAtMs } = parsedPid
      process.kill(pid, 'SIGTERM')
      const deadline = Date.now() + KILL_WAIT_MS
      let exited = false
      while (Date.now() < deadline) {
        try {
          process.kill(pid, 0)
        } catch {
          exited = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, KILL_POLL_MS))
      }
      if (!exited) {
        // Why: the wait permits PID recycling; identity must be rechecked before
        // escalating to SIGKILL.
        if (!(await isDaemonProcess(pid, socketPath, tokenPath, startedAtMs))) {
          console.warn('[daemon] Skipping SIGKILL for stale daemon: reason=pid_recycled')
          exited = true
          killedDaemon = true
        } else {
          try {
            process.kill(pid, 'SIGKILL')
            exited = true
          } catch {
            // Already dead.
          }
        }
      }
      killedDaemon ||= exited
    }
  } catch {
    // PID file missing or process already dead.
  }
  try {
    unlinkSync(pidPath)
  } catch {
    // Best effort.
  }
  const socketIsLive = await canConnectDaemonSocket(socketPath)
  if (process.platform !== 'win32' && existsSync(socketPath) && (killedDaemon || !socketIsLive)) {
    try {
      unlinkSync(socketPath)
    } catch {
      // Best effort.
    }
  }
  return killedDaemon
}
