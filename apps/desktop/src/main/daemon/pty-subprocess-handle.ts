import type * as pty from 'node-pty'

import { forceKillPosixPtyProcessGroups } from '../pty/posix-pty-process-groups'
import { isValidPtySize } from './pty-size'
import { createDaemonPtyForeground } from './pty-subprocess-foreground'
import type { SpawnedDaemonPty } from './pty-subprocess-spawn'
import type { PtySubprocessOptions } from './pty-subprocess-types'
import type { SubprocessHandle } from './session'

const PENDING_PRE_LISTENER_DATA_MAX_CHARS = 512 * 1024

function neutralizeRecycledPidKill(proc: pty.IPty): void {
  if (process.platform !== 'win32') {
    // Why: UnixTerminal schedules SIGHUP after socket close, when the reaped
    // child's pid may already belong to an unrelated process.
    ;(proc as unknown as { kill: (signal?: string) => void }).kill = () => {}
  }
}

export function createDaemonPtyHandle(
  spawned: SpawnedDaemonPty,
  options: PtySubprocessOptions
): SubprocessHandle {
  const proc = spawned.process
  const foreground = createDaemonPtyForeground({
    process: proc,
    shellPath: spawned.shellPath,
    options,
    startupAgentRecognition: spawned.startupAgentRecognition
  })
  let onDataCallback: ((data: string) => void) | null = null
  let onExitCallback: ((code: number) => void) | null = null
  let pendingData: string[] = []
  let pendingDataChars = 0
  let pendingExitCode: number | null = null
  let dead = false
  let disposed = false
  let nodePtyKillIssued = false

  const bufferData = (data: string): void => {
    pendingData.push(data)
    pendingDataChars += data.length
    while (pendingDataChars > PENDING_PRE_LISTENER_DATA_MAX_CHARS) {
      const removed = pendingData.shift()
      if (removed === undefined) {
        pendingDataChars = 0
        return
      }
      pendingDataChars -= removed.length
    }
  }
  const flushData = (): void => {
    if (!onDataCallback || pendingData.length === 0) {
      return
    }
    const buffered = pendingData
    pendingData = []
    pendingDataChars = 0
    for (const data of buffered) {
      onDataCallback(data)
    }
  }

  proc.onData((data) => {
    if (data.length > 0) {
      foreground.recordOutput()
    }
    if (onDataCallback) {
      onDataCallback(data)
    } else {
      bufferData(data)
    }
  })
  proc.onExit(({ exitCode }) => {
    if (onExitCallback) {
      flushData()
      onExitCallback(exitCode)
    } else {
      pendingExitCode = exitCode
    }
  })
  proc.onExit(() => {
    dead = true
    foreground.markDead()
    neutralizeRecycledPidKill(proc)
  })

  return {
    pid: proc.pid,
    shellPath: spawned.shellPath,
    ...(spawned.startupCommandDeliveredInShellArgs
      ? { startupCommandDeliveredInShellArgs: true }
      : {}),
    getForegroundProcess: foreground.getForegroundProcess,
    confirmForegroundProcess: foreground.confirmForegroundProcess,
    write: (data) => {
      if (dead) {
        return
      }
      try {
        proc.write(data)
      } catch {
        dead = true
        foreground.markDead()
      }
    },
    resize: (cols, rows) => {
      if (dead || !isValidPtySize(cols, rows)) {
        return
      }
      try {
        proc.resize(cols, rows)
      } catch {
        dead = true
        foreground.markDead()
      }
    },
    pause: () => {
      if (dead) {
        return
      }
      try {
        proc.pause()
      } catch {
        // Native flow control is best-effort during teardown.
      }
    },
    resume: () => {
      if (dead) {
        return
      }
      try {
        proc.resume()
      } catch {
        // Native flow control is best-effort during teardown.
      }
    },
    clear: () => {
      if (dead) {
        return
      }
      try {
        proc.clear()
      } catch {
        // A clear racing process exit does not invalidate the wrapper.
      }
    },
    kill: () => {
      if (dead) {
        return
      }
      nodePtyKillIssued = true
      try {
        proc.kill()
      } catch (error) {
        nodePtyKillIssued = false
        throw error
      }
    },
    forceKill: () => {
      if (dead || (process.platform === 'win32' && nodePtyKillIssued)) {
        return
      }
      try {
        forceKillPosixPtyProcessGroups(proc.pid, () => {
          process.kill(proc.pid, 'SIGKILL')
        })
      } catch (signalError) {
        try {
          proc.kill()
          nodePtyKillIssued = true
        } catch {
          nodePtyKillIssued = false
          throw signalError
        }
      }
    },
    signal: (signal) => {
      if (dead) {
        return
      }
      try {
        process.kill(proc.pid, signal)
      } catch {
        // Process may already be dead.
      }
    },
    onData: (callback) => {
      onDataCallback = callback
      flushData()
    },
    onExit: (callback) => {
      onExitCallback = callback
      if (pendingExitCode !== null) {
        const code = pendingExitCode
        pendingExitCode = null
        flushData()
        callback(code)
      }
    },
    dispose: () => {
      if (disposed) {
        return
      }
      disposed = true
      dead = true
      foreground.markDead()
      onDataCallback = null
      onExitCallback = null
      pendingData = []
      pendingDataChars = 0
      pendingExitCode = null
      neutralizeRecycledPidKill(proc)
      if (process.platform === 'win32' && nodePtyKillIssued) {
        return
      }
      try {
        ;(proc as unknown as { destroy?: () => void }).destroy?.()
      } catch {
        // Native handle may already be torn down.
      }
    }
  }
}
