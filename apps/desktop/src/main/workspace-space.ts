import type {
  WorkspaceSpaceAnalyzeResult,
  WorkspaceSpaceScanProgress
} from '~shared/workspace/space-types'

import type { Store } from './persistence'
import { analyzeWorkspaceSpace, WorkspaceSpaceScanCancelledError } from './workspace-space/analysis'

const PROGRESS_EMIT_INTERVAL_MS = 100

type InFlightWorkspaceSpaceScan = {
  scanId: string
  controller: AbortController
  progress: WorkspaceSpaceScanProgress
  promise: Promise<WorkspaceSpaceAnalyzeResult>
}

// Why: large worktree fleets require real disk traversal; duplicate calls —
// from any paired client, not just the one that started the scan — should
// share that IO instead of racing competing scans. Module-level rather than
// per-caller state is what makes that sharing possible across RPC calls.
let inFlightScan: InFlightWorkspaceSpaceScan | null = null

export function startOrJoinWorkspaceSpaceScan(
  store: Pick<Store, 'getRepos' | 'getWorktreeMeta'>,
  onProgress?: (progress: WorkspaceSpaceScanProgress) => void
): Promise<WorkspaceSpaceAnalyzeResult> {
  if (inFlightScan) {
    return inFlightScan.promise
  }

  const controller = new AbortController()
  const scanId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const initialProgress: WorkspaceSpaceScanProgress = {
    scanId,
    state: 'running',
    startedAt: Date.now(),
    updatedAt: Date.now(),
    totalRepoCount: 0,
    scannedRepoCount: 0,
    totalWorktreeCount: 0,
    scannedWorktreeCount: 0,
    currentRepoDisplayName: null,
    currentWorktreeDisplayName: null
  }
  const scan: InFlightWorkspaceSpaceScan = {
    scanId,
    controller,
    progress: initialProgress,
    promise: Promise.resolve(null as never)
  }
  inFlightScan = scan

  let lastProgressSentAt = 0
  const sendProgress = (progress: WorkspaceSpaceScanProgress): void => {
    // Why: large fleets can report one progress event per worktree; keep
    // paired clients responsive without a flood of near-duplicate ticks.
    const now = Date.now()
    const isFirstProgress = lastProgressSentAt === 0
    const isTerminalProgress =
      progress.state !== 'running' ||
      (progress.totalWorktreeCount > 0 &&
        progress.scannedWorktreeCount >= progress.totalWorktreeCount)
    scan.progress = progress
    if (
      !isFirstProgress &&
      !isTerminalProgress &&
      now - lastProgressSentAt < PROGRESS_EMIT_INTERVAL_MS
    ) {
      return
    }
    lastProgressSentAt = now
    onProgress?.(progress)
  }

  scan.promise = analyzeWorkspaceSpace(store, {
    scanId,
    signal: controller.signal,
    onProgress: sendProgress
  })
    .then((analysis): WorkspaceSpaceAnalyzeResult => ({ ok: true, analysis }))
    .catch((error: unknown): WorkspaceSpaceAnalyzeResult => {
      if (error instanceof WorkspaceSpaceScanCancelledError) {
        return { ok: false, cancelled: true }
      }
      throw error
    })
    .finally(() => {
      inFlightScan = null
    })
  return scan.promise
}

export function cancelInFlightWorkspaceSpaceScan(): boolean {
  if (!inFlightScan || inFlightScan.controller.signal.aborted) {
    return false
  }
  inFlightScan.controller.abort()
  inFlightScan.progress = {
    ...inFlightScan.progress,
    state: 'cancelling',
    updatedAt: Date.now()
  }
  return true
}
