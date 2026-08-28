import { normalizeRuntimePathForComparison } from '@yiru/runtime-protocol/model/platform'
import type { NestedRepoScanResult } from '@yiru/runtime-protocol/workbench/types'

// Why: scans used to be tracked inside the IPC handler module alone, so
// cancelNestedScan could only ever see scans started over that same face —
// a request routed through the oRPC/runtime path always reported "not found"
// and returned false. Tracking lives here instead so any transport that
// starts or cancels a scan on this host process sees the same state.
const activeScans = new Map<string, AbortController>()

type CompletedScan = { scan: NestedRepoScanResult; parentPath: string }
const completedScans = new Map<string, CompletedScan>()
const MAX_COMPLETED_SCANS = 50

export function beginTrackedNestedRepoScan(
  scanId: string | undefined
): AbortController | undefined {
  if (!scanId) {
    return undefined
  }
  const controller = new AbortController()
  activeScans.get(scanId)?.abort()
  activeScans.set(scanId, controller)
  return controller
}

export function endTrackedNestedRepoScan(
  scanId: string | undefined,
  controller: AbortController | undefined
): void {
  if (scanId && controller && activeScans.get(scanId) === controller) {
    activeScans.delete(scanId)
  }
}

export function cancelTrackedNestedRepoScan(scanId: string): boolean {
  const controller = activeScans.get(scanId)
  if (!controller) {
    return false
  }
  controller.abort()
  return true
}

export function rememberCompletedNestedRepoScan(
  scanId: string | undefined,
  scan: NestedRepoScanResult
): void {
  if (!scanId) {
    return
  }
  completedScans.set(scanId, { scan, parentPath: scan.selectedPath })
  while (completedScans.size > MAX_COMPLETED_SCANS) {
    const oldestScanId = completedScans.keys().next().value
    if (!oldestScanId) {
      break
    }
    completedScans.delete(oldestScanId)
  }
}

export function getCompletedNestedRepoScan(args: {
  scanId?: string
  parentPath: string
}): NestedRepoScanResult | undefined {
  if (!args.scanId) {
    return undefined
  }
  const completed = completedScans.get(args.scanId)
  if (!completed) {
    return undefined
  }
  if (
    normalizeRuntimePathForComparison(completed.parentPath) !==
    normalizeRuntimePathForComparison(args.parentPath)
  ) {
    return undefined
  }
  return completed.scan
}
