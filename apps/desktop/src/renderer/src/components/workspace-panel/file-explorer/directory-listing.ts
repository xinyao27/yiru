import type { DirEntry } from '../../../../../shared/types'
import { joinPath, normalizeRelativePath } from '../../../lib/path'
import { readRuntimeDirectory } from '../../../runtime/file-client'
import { shouldIncludeFileExplorerEntry } from './entries'
import {
  getFileExplorerOperationOwner,
  getFileExplorerOwnerUnresolvedMessage,
  getFileExplorerOperationRoute
} from './operation-owner'
import type { FileExplorerOperationOwner, TreeNode } from './types'

export type FileExplorerDirectoryListing = {
  entries: DirEntry[]
  operationOwner: FileExplorerOperationOwner
}

export function fileExplorerEntriesToTreeNodes(
  entries: DirEntry[],
  dirPath: string,
  depth: number,
  worktreePath: string | null,
  operationOwner: FileExplorerOperationOwner
): TreeNode[] {
  return entries.filter(shouldIncludeFileExplorerEntry).map((entry) => {
    const path = joinPath(dirPath, entry.name)
    return {
      name: entry.name,
      path,
      relativePath: worktreePath
        ? normalizeRelativePath(path.slice(worktreePath.length + 1))
        : entry.name,
      isDirectory: entry.isDirectory,
      isSymlink: entry.isSymlink,
      depth: depth + 1,
      operationOwner
    }
  })
}

export async function readFileExplorerDirectory(
  activeWorktreeId: string | null | undefined,
  worktreePath: string | null,
  dirPath: string
): Promise<FileExplorerDirectoryListing> {
  const operationOwner = getFileExplorerOperationOwner(activeWorktreeId)
  const route = getFileExplorerOperationRoute(operationOwner)
  if (!route) {
    throw new Error(getFileExplorerOwnerUnresolvedMessage())
  }
  const entries = await readRuntimeDirectory(
    {
      settings: route.settings,
      worktreeId: activeWorktreeId,
      worktreePath,
      connectionId: route.connectionId
    },
    dirPath
  )
  return { entries, operationOwner }
}
