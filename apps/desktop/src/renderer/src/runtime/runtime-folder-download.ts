import {
  isWindowsAbsolutePathLike,
  normalizeRuntimePathSeparators
} from '@yiru/workbench-model/platform'

import type { DirEntry } from '../../../shared/types'
import {
  readRuntimeDirectory,
  streamRuntimeFileDownloadChunks,
  type RuntimeFileDownloadResult,
  type RuntimeFileOperationArgs
} from './runtime-file-client'

function validateRemoteEntryName(name: string): void {
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new Error(`Invalid remote directory entry '${name}'`)
  }
}

async function downloadRuntimeDirectoryTree(
  context: RuntimeFileOperationArgs,
  remoteDirectoryPath: string,
  localPathSegments: string[],
  transferId: string,
  windowsRemotePaths: boolean
): Promise<void> {
  const entries = await readRuntimeDirectory(context, remoteDirectoryPath)
  const plannedEntries = [...entries]
  plannedEntries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of plannedEntries) {
    validateRemoteEntryName(entry.name)
    if (entry.isSymlink) {
      // Why: following a runtime-reported link could leave the selected tree.
      throw new Error(`Cannot download symbolic link '${entry.name}'`)
    }
    await downloadRuntimeEntry(
      context,
      remoteDirectoryPath,
      localPathSegments,
      transferId,
      windowsRemotePaths,
      entry
    )
  }
}

async function downloadRuntimeEntry(
  context: RuntimeFileOperationArgs,
  remoteDirectoryPath: string,
  localPathSegments: string[],
  transferId: string,
  windowsRemotePaths: boolean,
  entry: DirEntry
): Promise<void> {
  const normalizedDirectory = windowsRemotePaths
    ? normalizeRuntimePathSeparators(remoteDirectoryPath)
    : remoteDirectoryPath
  const remotePath = `${normalizedDirectory.replace(/\/+$/g, '')}/${entry.name}`
  const pathSegments = [...localPathSegments, entry.name]
  if (entry.isDirectory) {
    await window.api.fs.createDownloadedFolderDirectory({ transferId, pathSegments })
    await downloadRuntimeDirectoryTree(
      context,
      remotePath,
      pathSegments,
      transferId,
      windowsRemotePaths
    )
    return
  }
  await streamRuntimeFileDownloadChunks(context, remotePath, async (chunk) => {
    await window.api.fs.appendDownloadedFolderFileChunk({
      transferId,
      pathSegments,
      contentBase64: chunk.contentBase64,
      first: chunk.first,
      last: chunk.last
    })
  })
}

export async function downloadRuntimeFolder(
  context: RuntimeFileOperationArgs,
  dirPath: string,
  suggestedName: string
): Promise<RuntimeFileDownloadResult> {
  const download = await window.api.fs.startDownloadedFolder({ suggestedName })
  if (download.canceled) {
    return download
  }
  let finished = false
  try {
    await downloadRuntimeDirectoryTree(
      context,
      dirPath,
      [],
      download.transferId,
      isWindowsAbsolutePathLike(dirPath)
    )
    const result = await window.api.fs.finishDownloadedFolder({ transferId: download.transferId })
    finished = true
    return result
  } finally {
    if (!finished) {
      await window.api.fs
        .cancelDownloadedFolder({ transferId: download.transferId })
        .catch(() => {})
    }
  }
}
