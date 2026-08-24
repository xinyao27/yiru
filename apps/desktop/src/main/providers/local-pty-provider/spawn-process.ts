import * as pty from 'node-pty'
import { updateHistFileForFallback } from '~main/terminal-history'

import { getAgentForegroundContextPaths } from '../agent-foreground-context-paths'
import {
  createShellReadyScanState,
  drainShellReadyHeldBytes,
  scanForShellReady,
  writeStartupCommandWhenShellReady,
  STARTUP_COMMAND_READY_MAX_WAIT_MS
} from '../local-pty-shell-ready'
import type { ShellReadySignal } from '../local-pty-shell-ready'
import { spawnShellWithFallback } from '../local-pty-spawn'
import type { PtySpawnResult } from '../types'
import { LocalPtyProviderPrepareEnvironment } from './prepare-environment'
import type { LocalPtyEnvironmentContext } from './spawn-context'
import {
  ptyProcesses,
  ptyAgentSessionIds,
  ptyShellName,
  ptyAgentForegroundContextPaths,
  ptyTerminalHandle,
  ptyInitialCwd,
  ptyDisposables,
  ptyExitDisposables,
  ptyCleanupCallbacks,
  ptyTerminationMode,
  ptyPhysicalExits,
  ptyLoadGeneration,
  dataListeners,
  exitListeners,
  clearPtyState,
  createPtyPhysicalExit,
  getSpawnedShellName,
  getLocalPtyGeneration
} from './state'
import { destroyPtyProcess } from './termination'

export abstract class LocalPtyProviderSpawnProcess extends LocalPtyProviderPrepareEnvironment {
  protected spawnLocalPtyProcess(context: LocalPtyEnvironmentContext): PtySpawnResult {
    const {
      args,
      id,
      startupAgentRecognition,
      cwd,
      shellArgs,
      effectiveCwd,
      windowsFallbackAttempts,
      finalEnv,
      historyResult
    } = context
    let {
      shellPath,
      startupCommandDeliveredInShellArgs,
      shellReadyLaunch,
      getFallbackShellReadyConfig
    } = context
    const spawnResult = spawnShellWithFallback({
      shellPath,
      shellArgs,
      cols: args.cols,
      rows: args.rows,
      cwd: effectiveCwd,
      env: finalEnv,
      termName: finalEnv.TERM,
      ptySpawn: pty.spawn,
      getShellReadyConfig: getFallbackShellReadyConfig,
      // Why: if zsh failed and bash took over, HISTFILE still points to
      // zsh_history. Update it *before* spawn so the child inherits the
      // correct filename (see design doc §8).
      onBeforeFallbackSpawn: historyResult?.histFile
        ? (env, fallbackShell) => updateHistFileForFallback(env, fallbackShell)
        : undefined,
      windowsFallbackAttempts
    })
    shellPath = spawnResult.shellPath
    // Why: a Windows fallback (e.g. cmd.exe) embeds its own startup command in
    // argv, so honor the winning shell's delivery flag to avoid a double write.
    if (spawnResult.startupCommandDeliveredInShellArgs !== undefined) {
      startupCommandDeliveredInShellArgs = spawnResult.startupCommandDeliveredInShellArgs
    }
    if (args.command && getFallbackShellReadyConfig) {
      shellReadyLaunch = getFallbackShellReadyConfig(shellPath)
    }

    if (process.platform !== 'win32') {
      finalEnv.SHELL = shellPath
    }

    const proc = spawnResult.process
    createPtyPhysicalExit(id)
    ptyProcesses.set(id, proc)
    ptyInitialCwd.set(id, cwd)
    // Why both signals: launchAgent is the caller's explicit intent and
    // survives command rewriting (e.g. auth env prefixes); recognition covers
    // callers that pass a bare agent command line without the flag.
    if (args.launchAgent || startupAgentRecognition) {
      ptyAgentSessionIds.add(id)
    }
    ptyShellName.set(id, getSpawnedShellName(shellPath))
    if (finalEnv.YIRU_TERMINAL_HANDLE) {
      ptyTerminalHandle.set(id, finalEnv.YIRU_TERMINAL_HANDLE)
    }
    ptyAgentForegroundContextPaths.set(
      id,
      getAgentForegroundContextPaths({ cwd: args.cwd, worktreeId: args.worktreeId })
    )
    ptyLoadGeneration.set(id, getLocalPtyGeneration())
    this.opts.onSpawned?.(id)

    // Shell-ready startup command support
    let resolveShellReady: ((signal: ShellReadySignal) => void) | null = null
    let shellReadyTimeout: ReturnType<typeof setTimeout> | null = null
    const shellReadyScanState = shellReadyLaunch?.supportsReadyMarker
      ? createShellReadyScanState()
      : null
    const shellReadyPromise = args.command
      ? new Promise<ShellReadySignal>((resolve) => {
          resolveShellReady = resolve
        })
      : Promise.resolve({ postMarkerBytesObserved: false })
    const finishShellReady = (signal: ShellReadySignal): void => {
      if (!resolveShellReady) {
        return
      }
      if (shellReadyTimeout) {
        clearTimeout(shellReadyTimeout)
        shellReadyTimeout = null
      }
      const resolve = resolveShellReady
      resolveShellReady = null
      resolve(signal)
    }
    const releaseHeldShellReadyBytes = (): void => {
      if (!shellReadyScanState) {
        return
      }
      const heldBytes = drainShellReadyHeldBytes(shellReadyScanState)
      if (heldBytes.length === 0) {
        return
      }
      for (const cb of dataListeners) {
        cb({ id, data: heldBytes })
      }
    }
    if (args.command) {
      if (shellReadyLaunch?.supportsReadyMarker) {
        shellReadyTimeout = setTimeout(() => {
          releaseHeldShellReadyBytes()
          finishShellReady({ postMarkerBytesObserved: false })
        }, STARTUP_COMMAND_READY_MAX_WAIT_MS)
      } else {
        finishShellReady({ postMarkerBytesObserved: false })
      }
    }
    let startupCommandCleanup: (() => void) | null = null
    if (args.command) {
      ptyCleanupCallbacks.set(id, () => {
        if (shellReadyTimeout) {
          clearTimeout(shellReadyTimeout)
          shellReadyTimeout = null
        }
        releaseHeldShellReadyBytes()
        startupCommandCleanup?.()
        startupCommandCleanup = null
        resolveShellReady = null
      })
    }

    const disposables: { dispose: () => void }[] = []
    const onDataDisposable = proc.onData((rawData) => {
      let data = rawData
      if (shellReadyScanState && resolveShellReady) {
        const scanned = scanForShellReady(shellReadyScanState, rawData)
        data = scanned.output
        if (scanned.matched) {
          finishShellReady({ postMarkerBytesObserved: scanned.postMarkerBytesObserved })
        }
      }
      if (data.length === 0) {
        return
      }
      for (const cb of dataListeners) {
        cb({ id, data })
      }
    })
    if (onDataDisposable) {
      disposables.push(onDataDisposable)
    }

    const onExitDisposable = proc.onExit(({ exitCode }) => {
      const wasTerminationRequested = ptyTerminationMode.has(id)
      ptyPhysicalExits.get(id)?.markExited()
      // Why: neutralize proc.kill the instant the child is reaped, before any
      // other work in this callback. node-pty's UnixTerminal installs a
      // `_socket.once('close', () => this.kill('SIGHUP'))` handler at destroy
      // time, but the master socket can also emit 'close' on natural exit
      // between this onExit callback starting and destroyPtyProcess() running
      // below. If 'close' wins, SIGHUP is dispatched to proc.pid — which on
      // POSIX has already been reaped and may have been recycled to an
      // unrelated process. Synchronous neutralization here closes that window.
      // Windows is exempt: WindowsTerminal.destroy is implemented via kill().
      if (process.platform !== 'win32') {
        ;(proc as unknown as { kill: (sig?: string) => void }).kill = () => {}
      }
      if (shellReadyTimeout) {
        clearTimeout(shellReadyTimeout)
        shellReadyTimeout = null
      }
      startupCommandCleanup?.()
      clearPtyState(id)
      // Why: release the master ptmx fd on the natural-exit path — without
      // this, a shell that exits cleanly (the common case) never releases its
      // fd until the next GC. See docs/fix-pty-fd-leak.md.
      destroyPtyProcess(proc, { alreadyKilled: wasTerminationRequested })
      this.opts.onExit?.(id, exitCode)
      for (const cb of exitListeners) {
        cb({ id, code: exitCode })
      }
    })
    if (onExitDisposable) {
      ptyExitDisposables.set(id, onExitDisposable)
    }
    ptyDisposables.set(id, disposables)

    if (args.command && !startupCommandDeliveredInShellArgs) {
      // Why: only Yiru-wrapped POSIX bash/zsh have bracketed-paste mode armed
      // (bash via `bind`, zsh on by default), so multiline startup prompts can
      // be pasted literally there; other shells keep the raw submit path.
      const spawnedShellName = getSpawnedShellName(shellPath).toLowerCase()
      const bracketedPasteSafe =
        process.platform !== 'win32' && (spawnedShellName === 'bash' || spawnedShellName === 'zsh')
      writeStartupCommandWhenShellReady(
        shellReadyPromise,
        proc,
        args.command,
        (cleanup) => {
          startupCommandCleanup = cleanup
        },
        { bracketedPasteSafe }
      )
    }

    // Why: publish the OS pid so ipc/pty can register the PTY with the memory
    // collector without reaching back into the provider. `proc.pid` may be
    // briefly 0/undefined if node-pty hasn't observed the forked child yet.
    const rawPid = proc.pid
    const pid = typeof rawPid === 'number' && Number.isFinite(rawPid) && rawPid > 0 ? rawPid : null
    return { id, pid }
  }
}
