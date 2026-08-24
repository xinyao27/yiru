import type * as pty from 'node-pty'

import {
  LOCAL_PTY_FORCE_KILL_RETRY_MS,
  ptyTerminationMode,
  clearLocalPtyForceKillTimer,
  runPtyCleanup,
  disposePtyListeners,
  killLocalPtyProcess,
  armLocalPtyForceKill
} from './state'

export function destroyPtyProcess(proc: pty.IPty, options: { alreadyKilled?: boolean } = {}): void {
  // Why: node-pty's UnixTerminal.destroy() closes the master socket, which
  // releases the ptmx fd to the OS — without this call the fd leaks until GC
  // (see docs/fix-pty-fd-leak.md). destroy() also registers a close listener
  // that fires `this.kill('SIGHUP')` AFTER the socket closes. On POSIX, by
  // the time that listener runs the child may have exited and its pid been
  // recycled to an unrelated user process — SIGHUP would land on a Chrome tab,
  // editor, etc. Neutralize proc.kill on this instance before calling
  // destroy() to defuse the hazard. On Windows, destroy() is itself kill();
  // skip it only after we have already killed the ConPTY.
  if (process.platform === 'win32' && options.alreadyKilled) {
    return
  }
  if (process.platform !== 'win32') {
    ;(proc as unknown as { kill: (sig?: string) => void }).kill = () => {}
  }
  try {
    ;(proc as unknown as { destroy?: () => void }).destroy?.()
  } catch {
    /* swallow — already torn down */
  }
}

/**
 * Requests local PTY termination while retaining physical-exit ownership.
 */
export function requestPtyTermination(id: string, proc: pty.IPty): void {
  runPtyCleanup(id)
  disposePtyListeners(id)
  const previousMode = ptyTerminationMode.get(id)
  // Why: destructive cleanup neutralizes proc.kill below, so an outstanding
  // graceful request must be escalated before its deadline can be disabled.
  if (previousMode !== 'force') {
    clearLocalPtyForceKillTimer(id)
    ptyTerminationMode.set(id, 'force')
    try {
      killLocalPtyProcess(proc, true)
    } catch {
      if (previousMode === 'graceful') {
        ptyTerminationMode.set(id, previousMode)
        armLocalPtyForceKill(id, proc, {
          delayMs: LOCAL_PTY_FORCE_KILL_RETRY_MS,
          attemptsRemaining: 1
        })
      } else {
        ptyTerminationMode.delete(id)
      }
      /* Process may already be dead. */
      return
    }
  }
  // Why: shutdown and orphan cleanup can race; node-pty's onExit listener and
  // tracker must remain installed until the OS proves the child was reaped.
  destroyPtyProcess(proc, { alreadyKilled: true })
}
