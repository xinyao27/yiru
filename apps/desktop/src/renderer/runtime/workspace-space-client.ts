import { useAppStore } from '~renderer/store'
import type {
  WorkspaceSpaceAnalyzeResult,
  WorkspaceSpaceScanProgress
} from '~shared/workspace/space-types'

import { callRuntimeOrpc, createRuntimeOrpcClient, type RuntimeClientTarget } from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'

function activeWorkspaceSpaceTarget(): RuntimeClientTarget {
  return getActiveRuntimeTarget(useAppStore.getState().settings)
}

export function analyzeWorkspaceSpace(): Promise<WorkspaceSpaceAnalyzeResult> {
  return callRuntimeOrpc(
    activeWorkspaceSpaceTarget(),
    (client) => client.workspaceSpace.analyze,
    undefined
  )
}

export async function cancelWorkspaceSpaceScan(): Promise<boolean> {
  const result = await callRuntimeOrpc(
    activeWorkspaceSpaceTarget(),
    (client) => client.workspaceSpace.cancel,
    undefined
  )
  return result.cancelled
}

// Why: the scan is one host-wide singleton, so its progress is broadcast the
// same way to every paired client — this subscribes once for the caller's
// lifetime and fans out every tick, no scanId filter needed (contrast
// `workspaceCleanup`'s per-scanId subscription in workspace-cleanup-client.ts).
export function subscribeToWorkspaceSpaceScanProgress(
  onProgress: (progress: WorkspaceSpaceScanProgress) => void
): () => void {
  const controller = new AbortController()
  void (async () => {
    let connection: Awaited<ReturnType<typeof createRuntimeOrpcClient>> | null = null
    try {
      connection = await createRuntimeOrpcClient(activeWorkspaceSpaceTarget(), {
        signal: controller.signal
      })
      const stream = await connection.client.workspaceSpace.events.subscribe(undefined, {
        signal: controller.signal
      })
      for await (const event of stream) {
        if (controller.signal.aborted) {
          return
        }
        if (event.type === 'workspaceSpaceScanProgress') {
          onProgress(event.progress)
        }
      }
    } catch {
      // Why: an aborted subscription (unmount, or a dropped transport that a
      // reconnect will replace) must not surface as an unhandled rejection.
    } finally {
      connection?.close()
    }
  })()
  return () => controller.abort()
}
