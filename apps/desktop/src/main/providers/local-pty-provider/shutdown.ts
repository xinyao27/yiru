import type * as pty from 'node-pty'
import { killWithDescendantSweep } from '~main/pty-descendant-termination'

import { resolveProcessCwd } from '../process-cwd'
import { LocalPtyProviderIo } from './io'
import type { PtyShutdownOperation } from './state'
import {
  ptyProcesses,
  ptyAgentSessionIds,
  ptyShutdownOperations,
  ptyTerminationMode,
  ptyPhysicalExits,
  clearLocalPtyForceKillTimer,
  runPtyCleanup,
  waitForPtyPhysicalExit,
  killLocalPtyProcess,
  armLocalPtyForceKill
} from './state'

export abstract class LocalPtyProviderShutdown extends LocalPtyProviderIo {
  async shutdown(id: string, opts: { immediate?: boolean; keepHistory?: boolean }): Promise<void> {
    const pending = ptyShutdownOperations.get(id)
    if (pending) {
      if (opts.immediate === true) {
        pending.immediate = true
        if (pending.rootSignalled && ptyProcesses.get(id) === pending.proc) {
          this.requestTrackedPtyShutdown(id, pending.proc, true)
        }
      }
      await pending.promise
      return
    }
    const proc = ptyProcesses.get(id)
    if (!proc) {
      return
    }
    const entry: PtyShutdownOperation = {
      promise: Promise.resolve(),
      immediate: opts.immediate === true,
      rootSignalled: false,
      proc
    }
    entry.promise = this.shutdownTrackedPty(id, proc, entry)
    ptyShutdownOperations.set(id, entry)
    try {
      await entry.promise
    } finally {
      if (ptyShutdownOperations.get(id) === entry) {
        ptyShutdownOperations.delete(id)
      }
    }
  }

  protected async shutdownTrackedPty(
    id: string,
    proc: pty.IPty,
    operation: PtyShutdownOperation
  ): Promise<void> {
    const physicalExit = ptyPhysicalExits.get(id)
    const signalRoot = (): void => {
      // Why: a natural exit can race the sweep; never signal after ownership is lost.
      if (ptyProcesses.get(id) !== proc) {
        return
      }
      // Cancel startup delivery now, but preserve the exit listener and all
      // ownership maps until node-pty reports the physical process exit.
      runPtyCleanup(id)
      operation.rootSignalled = true
      this.requestTrackedPtyShutdown(id, proc, operation.immediate)
    }
    if (ptyAgentSessionIds.has(id)) {
      // Why: POSIX needs a pre-kill snapshot; Windows needs taskkill /T so
      // agent and MCP descendants cannot retain worktree directory handles.
      await killWithDescendantSweep(proc.pid, signalRoot, {
        ownsRoot: () => ptyProcesses.get(id) === proc
      })
    } else {
      signalRoot()
    }
    await waitForPtyPhysicalExit(id, physicalExit)
  }

  protected requestTrackedPtyShutdown(id: string, proc: pty.IPty, immediate: boolean): void {
    const previousMode = ptyTerminationMode.get(id)
    // Why: ConPTY has no graceful signal; its first bare node-pty kill closes
    // the pseudoconsole and must be treated as the final force request.
    const requestedMode = immediate || process.platform === 'win32' ? 'force' : 'graceful'
    if (!previousMode || (requestedMode === 'force' && previousMode !== 'force')) {
      ptyTerminationMode.set(id, requestedMode)
      try {
        killLocalPtyProcess(proc, immediate)
        if (requestedMode === 'graceful') {
          armLocalPtyForceKill(id, proc)
        } else {
          clearLocalPtyForceKillTimer(id)
        }
      } catch (error) {
        if (previousMode) {
          ptyTerminationMode.set(id, previousMode)
        } else {
          ptyTerminationMode.delete(id)
        }
        throw error
      }
    }
  }

  async sendSignal(id: string, signal: string): Promise<void> {
    const proc = ptyProcesses.get(id)
    if (!proc) {
      return
    }
    try {
      process.kill(proc.pid, signal)
    } catch {
      /* Process may already be dead */
    }
  }

  async getCwd(id: string): Promise<string> {
    const proc = ptyProcesses.get(id)
    // Why: return '' (not throw) on unknown id — the renderer treats empty
    // as "no result, try the next fallback layer". Throwing would surface a
    // noisy rejection for a non-exceptional case (PTY just exited, pane
    // still has its old id).
    if (!proc) {
      return ''
    }
    // Why: resolveProcessCwd returns '' when it can't resolve — let that
    // empty surface so the renderer's fallback chain decides what to do.
    // Handing back a fabricated initialCwd here would lie to the renderer
    // and short-circuit that chain.
    return resolveProcessCwd(proc.pid)
  }
  async getInitialCwd(_id: string): Promise<string> {
    return ''
  }
}
