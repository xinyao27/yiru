import { statSync } from 'node:fs'

import * as pty from 'node-pty'

import {
  ensureNodePtySpawnHelperExecutable,
  getNodePtySpawnHelperCandidates,
  validateWorkingDirectory
} from '../providers/local-pty-spawn'
import { resolveSafePtyDefaultCwd } from '../providers/pty-default-cwd'
import { DaemonProtocolError } from './types'

const PTY_SPAWN_HEALTH_TIMEOUT_MS = 4_000
const PTY_SPAWN_HEALTH_RETRY_ATTEMPTS = 2

/**
 * Returns a stable default working directory for daemon-spawned PTYs.
 */
export function getDefaultCwd(): string {
  return resolveSafePtyDefaultCwd()
}

/**
 * Formats a daemon preflight failure with the same ENOENT details node-pty exposes.
 */
function formatMissingDaemonPathError(kind: 'helper' | 'cwd', path: string): DaemonProtocolError {
  const detailName = kind === 'helper' ? 'helper' : 'cwd'
  const step = kind === 'helper' ? 'posix_spawn' : 'daemon_cwd'
  return new DaemonProtocolError(
    `Daemon's ${kind === 'helper' ? 'node-pty install' : 'working directory'} is gone ` +
      `(worktree deleted?). Restart Yiru. node-pty: ${step} failed: ENOENT ` +
      `(errno 2, No such file or directory) - ${detailName}='${path}'`
  )
}

/**
 * Checks whether a path currently exists and is a directory.
 */
function isExistingDirectory(path: string | undefined): path is string {
  if (!path) {
    return false
  }
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * Moves the daemon process to a stable cwd after its original cwd disappears.
 */
function repairDaemonCwd(): string | null {
  const candidates = [process.env.YIRU_USER_DATA_PATH]
  try {
    candidates.push(getDefaultCwd())
  } catch {
    // Keep daemon cwd repair best-effort even when no user terminal cwd is safe.
  }
  candidates.push(process.platform === 'win32' ? 'C:\\' : '/')
  for (const candidate of candidates) {
    if (isExistingDirectory(candidate)) {
      try {
        process.chdir(candidate)
        return candidate
      } catch {
        // Try the next stable cwd candidate.
      }
    }
  }
  return null
}

/**
 * Ensures the daemon cwd is valid before native PTY spawning.
 */
function preflightDaemonCwd(): void {
  let daemonCwd = '<unavailable>'
  try {
    daemonCwd = process.cwd()
    if (isExistingDirectory(daemonCwd)) {
      return
    }
  } catch {
    // Recover below; process.cwd() throws after the original cwd is deleted.
  }

  // Why: older detached daemons were launched from the repo cwd. If that
  // worktree disappears, node-pty's macOS spawn-helper can fail even when the
  // requested terminal cwd is valid.
  if (repairDaemonCwd()) {
    return
  }
  throw formatMissingDaemonPathError('cwd', daemonCwd)
}

/**
 * Validates macOS node-pty helper availability before spawning terminals.
 */
function preflightMacNodePtySpawnEnvironment(): void {
  if (process.platform !== 'darwin') {
    return
  }

  let candidates: string[]
  try {
    candidates = getNodePtySpawnHelperCandidates()
  } catch {
    throw formatMissingDaemonPathError('helper', '<unresolved>')
  }

  for (const candidate of candidates) {
    try {
      if (statSync(candidate).isFile()) {
        return
      }
    } catch {
      // Try the next node-pty native location.
    }
  }

  throw formatMissingDaemonPathError('helper', candidates[0] ?? '<unresolved>')
}

/**
 * Ensures POSIX daemon-owned native PTY spawn prerequisites are still valid.
 */
export function preflightUnixPtySpawnEnvironment(): void {
  if (process.platform === 'win32') {
    return
  }

  // Why: detached daemons can outlive their launch cwd; repair before every
  // PTY spawn so Linux/macOS do not wait for startup health recovery.
  preflightDaemonCwd()
  preflightMacNodePtySpawnEnvironment()
}

/**
 * Detects native Windows paths that should be validated before spawn.
 */
function isNativeWindowsPath(path: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(path) || path.startsWith('\\\\')
}

/**
 * Validates explicit native Windows cwd paths before ConPTY launch.
 */
export function preflightWindowsPtySpawnEnvironment(args: {
  validationCwd: string
  cwdWasExplicit: boolean
}): void {
  if (process.platform !== 'win32' || !args.cwdWasExplicit) {
    return
  }

  if (!isNativeWindowsPath(args.validationCwd)) {
    return
  }

  validateWorkingDirectory(args.validationCwd)
}

/**
 * Validates POSIX spawn cwd before node-pty can fail with an opaque ENOENT.
 */
export function preflightPosixPtySpawnEnvironment(validationCwd: string): void {
  if (process.platform === 'win32') {
    return
  }
  validateWorkingDirectory(validationCwd)
}

/**
 * Wraps native PTY spawn failures with shell and cwd context.
 */
export function formatPtySpawnError(err: unknown, shellPath: string, spawnCwd: string): Error {
  const message = err instanceof Error ? err.message : String(err)
  const formatted = new DaemonProtocolError(
    `Daemon failed to spawn shell "${shellPath}" with cwd "${spawnCwd}": ${message}`
  )
  if (err instanceof Error && err.stack) {
    formatted.stack = err.stack
  }
  return formatted
}

/**
 * Runs one short native PTY spawn probe (spawn `/bin/sh -c 'exit 0'`).
 */
function runSinglePtySpawnHealthProbe(): Promise<void> {
  const cwd = isExistingDirectory(process.env.YIRU_USER_DATA_PATH)
    ? process.env.YIRU_USER_DATA_PATH
    : getDefaultCwd()

  let proc: pty.IPty
  try {
    proc = pty.spawn('/bin/sh', ['-c', 'exit 0'], {
      name: 'xterm-256color',
      cols: 2,
      rows: 1,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color'
      }
    })
  } catch (err) {
    throw formatPtySpawnError(err, '/bin/sh', cwd)
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false
    let exitDisposable: { dispose(): void } | undefined
    const finish = (error?: Error, opts?: { kill?: boolean }): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      exitDisposable?.dispose()
      if (opts?.kill) {
        try {
          proc.kill()
        } catch {
          // Best-effort cleanup for a short-lived health probe.
        }
      }
      if (error) {
        reject(error)
        return
      }
      resolve()
    }
    const timer = setTimeout(() => {
      finish(new Error(`PTY spawn health check timed out after ${PTY_SPAWN_HEALTH_TIMEOUT_MS}ms`), {
        kill: true
      })
    }, PTY_SPAWN_HEALTH_TIMEOUT_MS)

    // Why: ping only proves the daemon protocol is alive. A real short-lived
    // PTY spawn catches stale node-pty helper paths captured by this process.
    exitDisposable = proc.onExit(({ exitCode }) => {
      if (exitCode === 0) {
        finish()
        return
      }
      finish(new Error(`PTY spawn health check exited with code ${exitCode}`))
    })
  })
}

/**
 * Runs a short native PTY spawn probe for daemon health checks, retrying once
 * so a transient stall (e.g. a busy machine right after an upgrade) does not
 * mis-classify a healthy daemon as unable to spawn PTYs.
 */
export async function checkPtySpawnHealth(): Promise<void> {
  if (process.platform === 'win32') {
    return
  }

  // Why: Linux/macOS daemons can outlive an app update with a deleted cwd or
  // stale native PTY path. A real short-lived spawn catches that before the
  // main process routes fresh panes to a daemon that cannot create terminals.
  if (process.platform === 'darwin') {
    ensureNodePtySpawnHelperExecutable()
  }
  preflightUnixPtySpawnEnvironment()

  let lastError: unknown
  for (let attempt = 1; attempt <= PTY_SPAWN_HEALTH_RETRY_ATTEMPTS; attempt++) {
    try {
      await runSinglePtySpawnHealthProbe()
      return
    } catch (err) {
      lastError = err
      if (attempt < PTY_SPAWN_HEALTH_RETRY_ATTEMPTS) {
        console.warn(
          `[daemon] PTY spawn health probe attempt ${attempt} failed; retrying`,
          err instanceof Error ? err.message : err
        )
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/**
 * Normalizes node-pty foreground process strings to executable basenames.
 */
