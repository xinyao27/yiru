import type {
  CoworkingFileListResult,
  CoworkingFileTreeEntry
} from '~shared/coworking/operation-contract'
import {
  COWORKING_FILE_LIST_VERIFIED_HOST_MAX_LIMIT,
  COWORKING_FILE_LIST_VERIFIED_HOST_PAGE_LIMIT
} from '~shared/coworking/operation-contract'
import { mapWithConcurrency } from '~shared/map-with-concurrency'

import { CoworkingExecutionError } from './execution-error'
import type { CoworkingFileOperationHost } from './file-operation-host'
import { projectCoworkingFileTreeEntry } from './file-tree-projection'
import type { CoworkingContainedPath } from './worktree-containment'

const COWORKING_FILE_METADATA_FILTER_CONCURRENCY = 16

export async function listVisibleCoworkingFiles(args: {
  host: CoworkingFileOperationHost
  path: CoworkingContainedPath
  relativePath: string
  limit: number
  signal: AbortSignal
}): Promise<CoworkingFileListResult> {
  const entries: CoworkingFileTreeEntry[] = []
  let offset = 0
  let complete = false
  while (
    !complete &&
    entries.length <= args.limit &&
    offset < COWORKING_FILE_LIST_VERIFIED_HOST_MAX_LIMIT
  ) {
    const pageLimit = Math.min(
      COWORKING_FILE_LIST_VERIFIED_HOST_PAGE_LIMIT,
      COWORKING_FILE_LIST_VERIFIED_HOST_MAX_LIMIT - offset
    )
    const page = await args.host.listVerified(args.path, offset, pageLimit, args.signal)
    requireValidHostPage(page.entries.length, page.nextOffset, offset, pageLimit)
    const projected = await mapWithConcurrency(
      page.entries,
      COWORKING_FILE_METADATA_FILTER_CONCURRENCY,
      async (entry) => {
        args.signal.throwIfAborted()
        const item = projectCoworkingFileTreeEntry(args.relativePath, entry)
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
        nextOffset > COWORKING_FILE_LIST_VERIFIED_HOST_MAX_LIMIT))
  ) {
    throw new CoworkingExecutionError('result_too_large')
  }
}
