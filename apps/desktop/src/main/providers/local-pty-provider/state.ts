import { basename } from 'node:path'
import { win32 as pathWin32 } from 'node:path'

import { splitWorktreeIdForFilesystem } from '@yiru/workbench-model/workspace'
import type * as pty from 'node-pty'
import { forceKillPosixPtyProcessGroups } from '~main/pty/posix-pty-process-groups'
import { parseWslPath } from '~main/wsl'
import { PhysicalExitTracker } from '~shared/physical-exit-tracker'

export let ptyCounter = 0
export const ptyProcesses = new Map<string, pty.IPty>()
// Why: only agent sessions get descendant tree-kill on shutdown. Agent CLIs
// spawn tool children in detached process groups the PTY's SIGHUP can never
// reach; plain user terminals keep classic semantics where deliberately
// detached (nohup-style) children survive the pane.
export const ptyAgentSessionIds = new Set<string>()
// Why: descendant capture is async. Reattach and duplicate shutdown must wait
// for the original owner instead of returning a PTY that is about to die.
export type PtyShutdownOperation = {
  promise: Promise<void>
  immediate: boolean
  rootSignalled: boolean
  proc: pty.IPty
}
export const ptyShutdownOperations = new Map<string, PtyShutdownOperation>()
export const ptyShellName = new Map<string, string>()
export const ptyAgentForegroundContextPaths = new Map<string, string[]>()
export const ptyTerminalHandle = new Map<string, string>()
export const ptyInitialCwd = new Map<string, string>()
// Why: node-pty callbacks must be disposed before environment teardown, but
// onExit separately owns physical process-exit proof during termination.
export const ptyDisposables = new Map<string, { dispose: () => void }[]>()
export const ptyExitDisposables = new Map<string, { dispose: () => void }>()
export const ptyCleanupCallbacks = new Map<string, () => void>()
export const ptyTerminationMode = new Map<string, 'graceful' | 'force'>()
export const ptyPhysicalExits = new Map<string, PhysicalExitTracker>()
export const ptyForceKillTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const LOCAL_PTY_PHYSICAL_EXIT_TIMEOUT_MS = 8_000
export const LOCAL_PTY_GRACEFUL_FORCE_TIMEOUT_MS = 5_000
export const LOCAL_PTY_FORCE_KILL_RETRY_MS = 250

export let loadGeneration = 0
export const ptyLoadGeneration = new Map<string, number>()

export type DataCallback = (payload: { id: string; data: string }) => void
export type ExitCallback = (payload: { id: string; code: number }) => void

export const dataListeners = new Set<DataCallback>()
export const exitListeners = new Set<ExitCallback>()

export function disposePtyListeners(id: string): void {
  const disposables = ptyDisposables.get(id)
  if (disposables) {
    for (const d of disposables) {
      d.dispose()
    }
    ptyDisposables.delete(id)
  }
}

export function disposePtyExitListener(id: string): void {
  ptyExitDisposables.get(id)?.dispose()
  ptyExitDisposables.delete(id)
}

export function clearLocalPtyForceKillTimer(id: string): void {
  const timer = ptyForceKillTimers.get(id)
  if (timer) {
    clearTimeout(timer)
    ptyForceKillTimers.delete(id)
  }
}

export function runPtyCleanup(id: string): void {
  const cleanup = ptyCleanupCallbacks.get(id)
  if (!cleanup) {
    return
  }
  ptyCleanupCallbacks.delete(id)
  cleanup()
}

/**
 * Resolves a WSL context from a worktree id whose path is already a WSL path.
 */
export function getWslContextFromWorktreeId(
  worktreeId: string | undefined
): { distro: string; treatPosixCwdAsWsl: true } | undefined {
  // Why: strip any synthetic `::workspace:<uuid>` folder-workspace suffix so WSL
  // detection parses the real path, not a nonexistent identifier.
  const worktreePath = worktreeId
    ? splitWorktreeIdForFilesystem(worktreeId)?.worktreePath
    : undefined
  const wslInfo = worktreePath ? parseWslPath(worktreePath) : null
  return wslInfo ? { distro: wslInfo.distro, treatPosixCwdAsWsl: true } : undefined
}

/**
 * Resolves a WSL launch context from a user-selected distro name.
 */
export function getWslContextFromPreferredDistro(
  distro: string | null | undefined
): { distro: string } | undefined {
  const trimmed = distro?.trim()
  return trimmed ? { distro: trimmed } : undefined
}

/**
 * Removes all local tracking state for a PTY id after teardown.
 */
export function clearPtyState(id: string): void {
  clearLocalPtyForceKillTimer(id)
  runPtyCleanup(id)
  disposePtyListeners(id)
  disposePtyExitListener(id)
  ptyProcesses.delete(id)
  ptyAgentSessionIds.delete(id)
  ptyShellName.delete(id)
  ptyAgentForegroundContextPaths.delete(id)
  ptyTerminalHandle.delete(id)
  ptyInitialCwd.delete(id)
  ptyLoadGeneration.delete(id)
  ptyTerminationMode.delete(id)
  ptyPhysicalExits.delete(id)
}

export function createPtyPhysicalExit(id: string): void {
  ptyPhysicalExits.set(id, new PhysicalExitTracker())
}

export function waitForPtyPhysicalExit(
  id: string,
  physicalExit?: PhysicalExitTracker
): Promise<void> {
  if (!physicalExit) {
    return Promise.reject(new Error(`PTY "${id}" exit tracking unavailable`))
  }
  return physicalExit.waitForExit(
    LOCAL_PTY_PHYSICAL_EXIT_TIMEOUT_MS,
    () => new Error(`Timed out waiting for PTY process exit: ${id}`)
  )
}

export function killLocalPtyProcess(proc: pty.IPty, immediate: boolean): void {
  if (process.platform === 'win32') {
    proc.kill()
    return
  }
  if (!immediate) {
    proc.kill('SIGTERM')
    return
  }
  forceKillPosixPtyProcessGroups(proc.pid, () => proc.kill('SIGKILL'))
}

export function armLocalPtyForceKill(
  id: string,
  proc: pty.IPty,
  options: { delayMs?: number; attemptsRemaining?: number } = {}
): void {
  if (ptyProcesses.get(id) !== proc || ptyTerminationMode.get(id) !== 'graceful') {
    return
  }
  const attemptsRemaining = options.attemptsRemaining ?? 2
  const timer = setTimeout(() => {
    ptyForceKillTimers.delete(id)
    if (ptyProcesses.get(id) !== proc || ptyTerminationMode.get(id) !== 'graceful') {
      return
    }
    ptyTerminationMode.set(id, 'force')
    try {
      killLocalPtyProcess(proc, true)
    } catch (error) {
      ptyTerminationMode.set(id, 'graceful')
      console.error('[pty] failed to force-kill PTY after graceful deadline', { id, error })
      // Why: a transient native rejection must not consume the only SIGKILL
      // owner while the logical shutdown continues waiting for physical exit.
      if (attemptsRemaining > 1) {
        armLocalPtyForceKill(id, proc, {
          delayMs: LOCAL_PTY_FORCE_KILL_RETRY_MS,
          attemptsRemaining: attemptsRemaining - 1
        })
      }
    }
  }, options.delayMs ?? LOCAL_PTY_GRACEFUL_FORCE_TIMEOUT_MS)
  timer.unref?.()
  ptyForceKillTimers.set(id, timer)
}

/**
 * Allocates either a stable caller-provided PTY id or a new numeric id.
 */
export function allocatePtyId(sessionId: string | undefined): string {
  const requested = normalizeLocalCallerSessionId(sessionId)
  if (requested) {
    return requested
  }
  let id: string
  do {
    id = String(++ptyCounter)
  } while (ptyProcesses.has(id))
  return id
}

/**
 * Normalizes renderer session ids that should be reused for local PTY reattach.
 */
export function normalizeLocalCallerSessionId(sessionId: string | undefined): string | null {
  const requested = sessionId?.trim()
  if (!requested || /^\d+$/.test(requested)) {
    return null
  }
  return requested
}

/**
 * Normalizes node-pty foreground process strings to executable basenames.
 */
export function normalizeForegroundProcessName(
  processName: string | null | undefined
): string | null {
  const trimmed = processName?.trim().replace(/^["']|["']$/g, '') ?? ''
  if (!trimmed || trimmed === 'xterm-256color') {
    return null
  }
  return trimmed.split(/[\\/]/).pop() || null
}

/**
 * Falls back to the spawned Windows shell when node-pty reports a terminal name.
 */
export function resolveForegroundFallbackProcess(
  processName: string | null | undefined,
  shellName: string | undefined
): string | null {
  if (process.platform !== 'win32' || normalizeForegroundProcessName(processName)) {
    return processName || null
  }
  // Why: Windows node-pty can expose only the terminal name (`xterm-256color`).
  // The spawned shell is the best fallback for agent foreground enrichment.
  return shellName ?? processName ?? null
}

/** Basename of the spawned shell path, parsed for the *target* platform rather
 *  than the host's native separator. Why: on Windows the shell path uses `\`,
 *  but the POSIX `basename` (used when orchestrating from a non-Windows host or
 *  CI) would not split it and would store the whole `C:\...\powershell.exe`
 *  path as the shell name — breaking the foreground/child-process comparison. */
export function getSpawnedShellName(shellPath: string): string {
  return process.platform === 'win32' ? pathWin32.basename(shellPath) : basename(shellPath)
}

export function getLocalPtyGeneration(): number {
  return loadGeneration
}

export function advanceLocalPtyGeneration(): number {
  loadGeneration += 1
  return loadGeneration
}
