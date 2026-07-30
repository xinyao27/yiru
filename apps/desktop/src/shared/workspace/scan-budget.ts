export const WORKSPACE_SPACE_MAX_SCANNED_ENTRIES = 100_000
export const WORKSPACE_SPACE_MAX_RETAINED_SCAN_BYTES = 64 * 1024 * 1024

const WORKSPACE_SPACE_ENTRY_OVERHEAD_BYTES = 512

export type WorkspaceSpaceScanLimits = {
  maxEntries: number
  maxRetainedBytes: number
}

export type WorkspaceSpaceScanBudget = {
  retainedBytes: number
  limits: WorkspaceSpaceScanLimits
}

function formatLiveStateLimit(bytes: number): string {
  const mebibytes = bytes / (1024 * 1024)
  return mebibytes >= 1
    ? `${Math.round(mebibytes * 10) / 10} MiB`
    : `${bytes.toLocaleString('en-US')} bytes`
}

export class WorkspaceSpaceScanCapacityError extends Error {
  constructor(limits: WorkspaceSpaceScanLimits) {
    super(
      `Workspace is too large to scan safely (limit: ${limits.maxEntries.toLocaleString('en-US')} entries or ${formatLiveStateLimit(limits.maxRetainedBytes)} of live scan state)`
    )
    this.name = 'WorkspaceSpaceScanCapacityError'
  }
}

export function createWorkspaceSpaceScanBudget(
  requested?: Partial<WorkspaceSpaceScanLimits>
): WorkspaceSpaceScanBudget {
  return {
    retainedBytes: 0,
    limits: {
      maxEntries: clampLimit(requested?.maxEntries, WORKSPACE_SPACE_MAX_SCANNED_ENTRIES),
      maxRetainedBytes: clampLimit(
        requested?.maxRetainedBytes,
        WORKSPACE_SPACE_MAX_RETAINED_SCAN_BYTES
      )
    }
  }
}

function estimateEntryRetainedBytes(entryName: string): number {
  return entryName.length * 2 + WORKSPACE_SPACE_ENTRY_OVERHEAD_BYTES
}

function retainEntry(
  budget: WorkspaceSpaceScanBudget,
  entryName: string,
  listingEntryCount: number,
  additionalBytes: number
): void {
  const retainedBytes =
    budget.retainedBytes + estimateEntryRetainedBytes(entryName) + additionalBytes
  if (
    listingEntryCount >= budget.limits.maxEntries ||
    retainedBytes > budget.limits.maxRetainedBytes
  ) {
    throw new WorkspaceSpaceScanCapacityError(budget.limits)
  }
  budget.retainedBytes = retainedBytes
}

export function releaseWorkspaceSpaceScanEntries(
  budget: WorkspaceSpaceScanBudget,
  retainedBytes: number
): void {
  budget.retainedBytes = Math.max(0, budget.retainedBytes - retainedBytes)
}

export type WorkspaceSpaceDirectoryAdmission<TEntry> = {
  entries: TEntry[]
  retainedBytes: number
}

export async function collectWorkspaceSpaceDirectoryEntries<TEntry>(
  directory: AsyncIterable<TEntry> | Iterable<TEntry>,
  parentPath: string,
  entryName: (entry: TEntry) => string,
  budget: WorkspaceSpaceScanBudget,
  checkCancelled: () => void
): Promise<WorkspaceSpaceDirectoryAdmission<TEntry>> {
  const entries: TEntry[] = []
  let retainedBytes = 0
  try {
    for await (const entry of directory) {
      checkCancelled()
      const name = entryName(entry)
      const listingBytes = entries.length === 0 ? parentPath.length * 2 : 0
      retainEntry(budget, name, entries.length, listingBytes)
      retainedBytes += estimateEntryRetainedBytes(name) + listingBytes
      entries.push(entry)
    }
  } catch (error) {
    // Why: rejected listings are never returned, so release their partial charge here.
    releaseWorkspaceSpaceScanEntries(budget, retainedBytes)
    throw error
  }
  return { entries, retainedBytes }
}

function clampLimit(value: number | undefined, maximum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    return maximum
  }
  return Math.min(value, maximum)
}
