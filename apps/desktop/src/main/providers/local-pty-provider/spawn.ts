import type { PtySpawnOptions, PtySpawnResult } from '../types'
import { LocalPtyProviderSpawnProcess } from './spawn-process'
import {
  ptyProcesses,
  ptyShutdownOperations,
  allocatePtyId,
  normalizeLocalCallerSessionId
} from './state'

export abstract class LocalPtyProviderSpawn extends LocalPtyProviderSpawnProcess {
  async spawn(args: PtySpawnOptions): Promise<PtySpawnResult> {
    const reattachId = normalizeLocalCallerSessionId(args.sessionId)
    if (reattachId) {
      const pendingShutdown = ptyShutdownOperations.get(reattachId)
      if (pendingShutdown) {
        await pendingShutdown.promise
      }
      const existing = ptyProcesses.get(reattachId)
      if (existing) {
        try {
          existing.resize(args.cols, args.rows)
        } catch {
          /* Existing PTY may reject resize during teardown. */
        }
        return { id: reattachId, pid: existing.pid, isReattach: true }
      }
    }
    const id = allocatePtyId(reattachId ?? undefined)
    const shell = this.resolveLocalPtyShell(args, id)
    return this.spawnLocalPtyProcess(this.prepareLocalPtyEnvironment(shell))
  }
}
