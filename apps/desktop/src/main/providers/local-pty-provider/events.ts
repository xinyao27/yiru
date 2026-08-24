import type * as pty from 'node-pty'

import { LocalPtyProviderInspection } from './inspection'
import type { ExitCallback } from './state'
import {
  ptyProcesses,
  ptyTerminationMode,
  ptyPhysicalExits,
  ptyLoadGeneration,
  exitListeners,
  runPtyCleanup,
  disposePtyListeners,
  disposePtyExitListener,
  clearPtyState,
  advanceLocalPtyGeneration
} from './state'
import { destroyPtyProcess, requestPtyTermination } from './termination'

export abstract class LocalPtyProviderEvents extends LocalPtyProviderInspection {
  onReplay(_callback: (payload: { id: string; data: string }) => void): () => void {
    return () => {}
  }

  onExit(callback: ExitCallback): () => void {
    exitListeners.add(callback)
    return () => exitListeners.delete(callback)
  }

  // ─── Local-only helpers (not part of IPtyProvider interface) ───────

  /** Kill orphaned PTYs from previous page loads. */
  killOrphanedPtys(currentGeneration: number): { id: string }[] {
    const killed: { id: string }[] = []
    for (const [id, proc] of ptyProcesses) {
      if ((ptyLoadGeneration.get(id) ?? -1) < currentGeneration) {
        requestPtyTermination(id, proc)
        killed.push({ id })
      }
    }
    return killed
  }

  /** Advance the load generation counter (called on renderer reload). */
  advanceGeneration(): number {
    return advanceLocalPtyGeneration()
  }

  /** Get a writable reference to a PTY (for runtime controller). */
  getPtyProcess(id: string): pty.IPty | undefined {
    return ptyProcesses.get(id)
  }

  /** Kill all in-process local PTYs. Call on app quit. */
  killAll(): void {
    for (const [id, proc] of ptyProcesses) {
      runPtyCleanup(id)
      disposePtyListeners(id)
      disposePtyExitListener(id)
      if (!(process.platform === 'win32' && ptyTerminationMode.has(id))) {
        try {
          proc.kill()
        } catch {
          /* Process may already be dead. */
        }
      }
      // Why: app quit cannot retain NAPI callbacks into FreeEnvironment; the
      // process exit itself is the final physical handle boundary here.
      destroyPtyProcess(proc, { alreadyKilled: true })
      // Why: app quit replaces node-pty's onExit callback as the final owner;
      // overlapping shutdown waiters must join that same terminal boundary.
      ptyPhysicalExits.get(id)?.markExited()
      clearPtyState(id)
    }
  }
}
