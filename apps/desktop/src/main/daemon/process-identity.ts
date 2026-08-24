import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import {
  queryWindowsProcessIdentity,
  startTimeMatches,
  startTimesWithinTolerance,
  WIN32_START_TIME_TOLERANCE_MS
} from './process-start-time'
import { getDaemonPidPath } from './spawner'
import { PROTOCOL_VERSION } from './types'

export type ParsedDaemonPid = {
  pid: number
  startedAtMs: number | null
  entryPath: string | null
  appVersion: string | null
}

function commandLineMatchesDaemon(
  commandLine: string,
  socketPath: string,
  tokenPath: string
): boolean {
  return (
    commandLine.includes('daemon-entry') &&
    commandLine.includes(socketPath) &&
    commandLine.includes(tokenPath)
  )
}

export function parseDaemonPidFile(contents: string): ParsedDaemonPid | null {
  const trimmed = contents.trim()
  try {
    const parsed = JSON.parse(trimmed) as {
      pid?: unknown
      startedAtMs?: unknown
      entryPath?: unknown
      appVersion?: unknown
    }
    if (typeof parsed.pid === 'number' && Number.isFinite(parsed.pid)) {
      return {
        pid: parsed.pid,
        startedAtMs:
          typeof parsed.startedAtMs === 'number' && Number.isFinite(parsed.startedAtMs)
            ? parsed.startedAtMs
            : null,
        entryPath: typeof parsed.entryPath === 'string' ? parsed.entryPath : null,
        appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion : null
      }
    }
  } catch {
    // Legacy daemon pid files contain a bare integer.
  }
  const pid = Number(trimmed)
  return Number.isFinite(pid) ? { pid, startedAtMs: null, entryPath: null, appVersion: null } : null
}

export async function isDaemonProcess(
  pid: number,
  socketPath: string,
  tokenPath: string,
  startedAtMs: number | null
): Promise<boolean> {
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  if (process.platform === 'win32') {
    const identity = await queryWindowsProcessIdentity(pid)
    return (
      identity !== null &&
      commandLineMatchesDaemon(identity.commandLine, socketPath, tokenPath) &&
      startTimesWithinTolerance(identity.startedAtMs, startedAtMs, WIN32_START_TIME_TOLERANCE_MS)
    )
  }
  try {
    const commandLine = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
    return (
      commandLineMatchesDaemon(commandLine, socketPath, tokenPath) &&
      startTimeMatches(pid, startedAtMs)
    )
  } catch {
    try {
      const commandLine = execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
        encoding: 'utf8',
        timeout: 2_000
      })
      return (
        commandLineMatchesDaemon(commandLine, socketPath, tokenPath) &&
        startTimeMatches(pid, startedAtMs)
      )
    } catch {
      return false
    }
  }
}

export async function getDaemonCommandLine(pid: number): Promise<string | null> {
  if (process.platform === 'win32') {
    return (await queryWindowsProcessIdentity(pid))?.commandLine ?? null
  }
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8')
  } catch {
    try {
      return execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
        encoding: 'utf8',
        timeout: 2_000
      })
    } catch {
      return null
    }
  }
}

export async function readVerifiedDaemonPid(
  runtimeDir: string,
  socketPath: string,
  tokenPath: string,
  protocolVersion = PROTOCOL_VERSION
): Promise<ParsedDaemonPid | null> {
  let parsedPid: ParsedDaemonPid | null
  try {
    parsedPid = parseDaemonPidFile(
      readFileSync(getDaemonPidPath(runtimeDir, protocolVersion), 'utf8')
    )
  } catch {
    return null
  }
  if (
    !parsedPid ||
    !(await isDaemonProcess(parsedPid.pid, socketPath, tokenPath, parsedPid.startedAtMs))
  ) {
    return null
  }
  return parsedPid
}
