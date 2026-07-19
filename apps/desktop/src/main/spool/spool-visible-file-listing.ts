import { mapWithConcurrency } from '../../shared/map-with-concurrency'
import type {
  SpoolFileListResult,
  SpoolFileTreeEntry
} from '../../shared/spool/spool-operation-contract'
import {
  SPOOL_FILE_LIST_VERIFIED_HOST_MAX_LIMIT,
  SPOOL_FILE_LIST_VERIFIED_HOST_PAGE_LIMIT
} from '../../shared/spool/spool-operation-contract'
import { SpoolExecutionError } from './spool-execution-error'
import type { SpoolFileOperationHost } from './spool-file-operation-host'
import { projectSpoolFileTreeEntry } from './spool-file-tree-projection'
import type { SpoolContainedPath } from './spool-worktree-containment'

const SPOOL_FILE_METADATA_FILTER_CONCURRENCY = 16

export async function listVisibleSpoolFiles(args: {
  host: SpoolFileOperationHost
  path: SpoolContainedPath
  relativePath: string
  limit: number
  signal: AbortSignal
}): Promise<SpoolFileListResult> {
  const entries: SpoolFileTreeEntry[] = []
  let offset = 0
  let complete = false
  while (
    !complete &&
    entries.length <= args.limit &&
    offset < SPOOL_FILE_LIST_VERIFIED_HOST_MAX_LIMIT
  ) {
    const pageLimit = Math.min(
      SPOOL_FILE_LIST_VERIFIED_HOST_PAGE_LIMIT,
      SPOOL_FILE_LIST_VERIFIED_HOST_MAX_LIMIT - offset
    )
    const page = await args.host.listVerified(args.path, offset, pageLimit, args.signal)
    requireValidHostPage(page.entries.length, page.nextOffset, offset, pageLimit)
    const projected = await mapWithConcurrency(
      page.entries,
      SPOOL_FILE_METADATA_FILTER_CONCURRENCY,
      async (entry) => {
        args.signal.throwIfAborted()
        const item = projectSpoolFileTreeEntry(args.relativePath, entry)
        const hidden = item
          ? await args.path.isHiddenMetadataChild(entry.name, entry.kind, args.signal)
          : true
        args.signal.throwIfAborted()
        return hidden ? null : item
      }
    )
    entries.push(...projected.filter((entry) => entry !== null))
    complete = page.nextOffset === null
    offset = page.nextOffset ?? offset + page.entries.length
  }
  return {
    relativePath: args.relativePath,
    entries: entries.slice(0, args.limit),
    truncated: entries.length > args.limit || !complete
  }
}

function requireValidHostPage(
  entryCount: number,
  nextOffset: number | null,
  offset: number,
  limit: number
): void {
  if (
    entryCount > limit ||
    (nextOffset !== null &&
      (entryCount !== limit ||
        nextOffset !== offset + entryCount ||
        nextOffset > SPOOL_FILE_LIST_VERIFIED_HOST_MAX_LIMIT))
  ) {
    throw new SpoolExecutionError('result_too_large')
  }
}
