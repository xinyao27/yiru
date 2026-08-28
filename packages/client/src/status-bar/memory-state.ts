import type { MemorySnapshot } from '@yiru/runtime-protocol/workbench/types'
import type { StateCreator } from 'zustand'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import type { AppState } from '~renderer/store/types'

export type MemorySlice = {
  memorySnapshot: MemorySnapshot | null
  memorySnapshotError: string | null
  fetchMemorySnapshot: () => Promise<void>
}

export const createMemorySlice: StateCreator<AppState, [], [], MemorySlice> = (set, get) => {
  let inFlightSnapshot: Promise<void> | null = null

  return {
    memorySnapshot: null,
    memorySnapshotError: null,

    fetchMemorySnapshot: () => {
      if (inFlightSnapshot) {
        return inFlightSnapshot
      }
      const request = (async () => {
        try {
          // Why: this segment reports the active runtime's own resource use —
          // switching the active environment must show that host's memory,
          // not the machine running the Electron shell. `diagnostics.memory`
          // covers both targets identically (same `collectMemorySnapshot`
          // call the desktop IPC handler used to make), so there is no
          // local-vs-remote branch left to preserve.
          const target = getActiveRuntimeTarget(get().settings)
          const snapshot = await callRuntimeOrpc(
            target,
            (client) => client.diagnostics.memory,
            undefined
          )
          set({ memorySnapshot: snapshot, memorySnapshotError: null })
        } catch (err) {
          // Why: the always-on Resource Manager status-bar segment needs to know when
          // the snapshot IPC is failing so it can surface a "daemon not responding"
          // banner with a Restart CTA. Prior code only console.error'd.
          console.error('Failed to fetch memory snapshot:', err)
          set({
            memorySnapshotError: err instanceof Error ? err.message : String(err)
          })
        }
      })()
      const trackedRequest = request.finally(() => {
        if (inFlightSnapshot === trackedRequest) {
          inFlightSnapshot = null
        }
      })
      inFlightSnapshot = trackedRequest
      return trackedRequest
    }
  }
}
