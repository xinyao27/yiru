import { useAppStore } from '~renderer/store'
import type {
  WorkspaceCleanupDismissal,
  WorkspaceCleanupScanArgs,
  WorkspaceCleanupScanProgress,
  WorkspaceCleanupScanResult
} from '~shared/workspace/cleanup'

import { callRuntimeOrpc, createRuntimeOrpcClient, type RuntimeClientTarget } from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'

function activeWorkspaceCleanupTarget(): RuntimeClientTarget {
  return getActiveRuntimeTarget(useAppStore.getState().settings)
}

// Why: scan progress is per-scanId, not host-wide (see
// `workspaceCleanup.events.subscribe`'s contract comment) — the caller
// passes its own scanId and callback, this just owns the stream's lifecycle.
async function subscribeToWorkspaceCleanupScanProgress(
  target: RuntimeClientTarget,
  scanId: string,
  onProgress: (progress: WorkspaceCleanupScanProgress) => void
): Promise<() => void> {
  const abort = new AbortController()
  try {
    const connection = await createRuntimeOrpcClient(target, { signal: abort.signal })
    const stream = await connection.client.workspaceCleanup.events.subscribe(undefined, {
      signal: abort.signal
    })
    void (async () => {
      try {
        for await (const event of stream) {
          if (event.type === 'workspaceCleanupScanProgress' && event.progress.scanId === scanId) {
            onProgress(event.progress)
          }
        }
      } catch {
        // Why: the scan RPC call resolves/rejects on its own — a dropped
        // progress stream just means fewer ticks, not a failed scan.
      } finally {
        connection.close()
      }
    })()
    return () => abort.abort()
  } catch (err) {
    console.error('Failed to subscribe to workspace cleanup scan progress:', err)
    return () => {}
  }
}

export async function scanWorkspaceCleanup(
  args?: WorkspaceCleanupScanArgs,
  onProgress?: (progress: WorkspaceCleanupScanProgress) => void
): Promise<WorkspaceCleanupScanResult> {
  const target = activeWorkspaceCleanupTarget()
  if (!onProgress) {
    return callRuntimeOrpc(target, (client) => client.workspaceCleanup.scan, args ?? {})
  }
  const scanId = args?.scanId ?? crypto.randomUUID()
  const unsubscribe = await subscribeToWorkspaceCleanupScanProgress(target, scanId, onProgress)
  try {
    return await callRuntimeOrpc(target, (client) => client.workspaceCleanup.scan, {
      ...args,
      scanId
    })
  } finally {
    unsubscribe()
  }
}

export async function dismissWorkspaceCleanupCandidates(
  dismissals: readonly WorkspaceCleanupDismissal[]
): Promise<Record<string, WorkspaceCleanupDismissal>> {
  const result = await callRuntimeOrpc(
    activeWorkspaceCleanupTarget(),
    (client) => client.workspaceCleanup.dismiss,
    { dismissals: [...dismissals] }
  )
  return result.dismissals
}

export async function clearWorkspaceCleanupDismissals(): Promise<
  Record<string, WorkspaceCleanupDismissal>
> {
  const result = await callRuntimeOrpc(
    activeWorkspaceCleanupTarget(),
    (client) => client.workspaceCleanup.clearDismissals,
    undefined
  )
  return result.dismissals
}
