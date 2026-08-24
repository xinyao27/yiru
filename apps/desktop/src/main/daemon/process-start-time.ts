import { execFile, execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'

import {
  getProcessOutputFields,
  iterateProcessOutputLines
} from '~shared/process-output-field-scanner'

import { isStartupDiagnosticsEnabled, logStartupDiagnostic } from '../startup/diagnostics'

const START_TIME_TOLERANCE_MS = 1_500
export const WIN32_START_TIME_TOLERANCE_MS = 10_000
const execFileAsync = promisify(execFile)

export function parseLinuxProcStartTicks(stat: string): number {
  const commandEndIndex = stat.lastIndexOf(')')
  if (commandEndIndex === -1) {
    return Number.NaN
  }
  return Number(getProcessOutputFields(stat.slice(commandEndIndex + 1), 20)[19])
}

export function parseLinuxBootTimeSeconds(procStat: string): number {
  for (const line of iterateProcessOutputLines(procStat)) {
    if (line.startsWith('btime ')) {
      return Number(getProcessOutputFields(line, 2)[1])
    }
  }
  return Number.NaN
}

function getLinuxProcessStartedAtMs(pid: number): number | null {
  try {
    const startTicks = parseLinuxProcStartTicks(readFileSync(`/proc/${pid}/stat`, 'utf8'))
    const bootTimeSeconds = parseLinuxBootTimeSeconds(readFileSync('/proc/stat', 'utf8'))
    const ticksPerSecond = Number(
      execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8', timeout: 1_000 }).trim()
    )
    if (
      !Number.isFinite(startTicks) ||
      !Number.isFinite(bootTimeSeconds) ||
      !Number.isFinite(ticksPerSecond) ||
      ticksPerSecond <= 0
    ) {
      return null
    }
    return bootTimeSeconds * 1000 + (startTicks / ticksPerSecond) * 1000
  } catch {
    return null
  }
}

export function getProcessStartedAtMs(pid: number): number | null {
  if (process.platform === 'linux') {
    return getLinuxProcessStartedAtMs(pid)
  }
  // Why: Windows requires an expensive CIM query; its async identity probe
  // verifies creation time together with the command line.
  if (process.platform === 'win32') {
    return null
  }
  try {
    const output = execFileSync('ps', ['-p', String(pid), '-o', 'lstart='], {
      encoding: 'utf8',
      timeout: 2_000
    }).trim()
    const startedAtMs = Date.parse(output)
    return Number.isFinite(startedAtMs) ? startedAtMs : null
  } catch {
    return null
  }
}

export function startTimeMatches(pid: number, expectedStartedAtMs: number | null): boolean {
  return startTimesWithinTolerance(
    getProcessStartedAtMs(pid),
    expectedStartedAtMs,
    START_TIME_TOLERANCE_MS
  )
}

// Why: fail open when either source lacks time; command identity still guards
// adoption, while missing OS metadata must not kill live sessions.
export function startTimesWithinTolerance(
  actualStartedAtMs: number | null,
  expectedStartedAtMs: number | null,
  toleranceMs: number
): boolean {
  return (
    expectedStartedAtMs === null ||
    actualStartedAtMs === null ||
    Math.abs(actualStartedAtMs - expectedStartedAtMs) <= toleranceMs
  )
}

export type WindowsProcessIdentity = {
  commandLine: string
  startedAtMs: number | null
}

export function parseWindowsProcessIdentityJson(stdout: string): WindowsProcessIdentity | null {
  const trimmed = stdout.trim()
  if (!trimmed) {
    return null
  }
  try {
    const parsed = JSON.parse(trimmed) as { cmd?: unknown; start?: unknown }
    if (typeof parsed.cmd !== 'string' || !parsed.cmd) {
      return null
    }
    return {
      commandLine: parsed.cmd,
      startedAtMs:
        typeof parsed.start === 'number' && Number.isFinite(parsed.start) ? parsed.start : null
    }
  } catch {
    return null
  }
}

export async function queryWindowsProcessIdentity(
  pid: number
): Promise<WindowsProcessIdentity | null> {
  const startedAt = performance.now()
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}"; ` +
          `if ($p) { $start = $null; ` +
          `if ($p.CreationDate) { $start = [long]([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds() }; ` +
          `@{ cmd = $p.CommandLine; start = $start } | ConvertTo-Json -Compress }`
      ],
      { encoding: 'utf8', timeout: 3_000 }
    )
    return parseWindowsProcessIdentityJson(stdout)
  } catch {
    return null
  } finally {
    if (isStartupDiagnosticsEnabled()) {
      logStartupDiagnostic('daemon-pid-check', {
        t: Math.round(performance.now()),
        pid,
        ms: Math.round(performance.now() - startedAt)
      })
    }
  }
}
