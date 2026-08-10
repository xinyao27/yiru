import {
  handleFilesBrowseServerDir,
  handleFilesList,
  handleFilesOpen,
  handleFilesOpenDiff,
  handleFilesRead,
  handleFilesReadChunk,
  handleFilesReadDir,
  handleFilesReadPreview,
  handleFilesReadTerminalArtifact,
  handleFilesReadTerminalArtifactPreview,
  handleFilesResolveTerminalPath,
  handleFilesSearchPaths,
  handleFilesWriteTerminalArtifact
} from '~main/runtime/rpc/methods/files/mobile-methods'
import {
  handleFilesCommitUpload,
  handleFilesCopy,
  handleFilesCreateDir,
  handleFilesCreateDirNoClobber,
  handleFilesCreateFile,
  handleFilesDelete,
  handleFilesRename,
  handleFilesWrite,
  handleFilesWriteBase64,
  handleFilesWriteBase64Chunk
} from '~main/runtime/rpc/methods/files/mutation-methods'
import {
  handleFilesListAll,
  handleFilesListMarkdownDocuments,
  handleFilesSearch,
  handleFilesStat
} from '~main/runtime/rpc/methods/files/query-methods'
import { handleFilesUnwatch, handleFilesWatch } from '~main/runtime/rpc/methods/files/watch-methods'
import {
  handleFilesReadLogTail,
  handleFilesWatchLogTail
} from '~main/runtime/rpc/methods/log-tail-methods'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'
import { wireRuntimeStream } from '../registered-stream'

// Why: the whole `files` contract domain has to land in one object — every
// leaf sits under the same top-level `files` key, and router-direct.ts
// merges each part's export with a plain object spread, which would let a
// second `files: {...}` sibling silently clobber this one instead of
// merging into it. Query/mutation/watch/log-tail cover a worktree's file
// explorer; mobile-methods.ts covers the mobile app's own bounded reads,
// out-of-tree path resolution, and server-directory browsing.
export const filesRuntimeHandlers = {
  files: {
    list: runtimeImplementation.files.list.handler(
      wireRuntimeMethod('files.list', handleFilesList)
    ),
    searchPaths: runtimeImplementation.files.searchPaths.handler(
      wireRuntimeMethod('files.searchPaths', handleFilesSearchPaths)
    ),
    open: runtimeImplementation.files.open.handler(
      wireRuntimeMethod('files.open', handleFilesOpen)
    ),
    openDiff: runtimeImplementation.files.openDiff.handler(
      wireRuntimeMethod('files.openDiff', handleFilesOpenDiff)
    ),
    read: runtimeImplementation.files.read.handler(
      wireRuntimeMethod('files.read', handleFilesRead)
    ),
    resolveTerminalPath: runtimeImplementation.files.resolveTerminalPath.handler(
      wireRuntimeMethod('files.resolveTerminalPath', handleFilesResolveTerminalPath)
    ),
    readTerminalArtifact: runtimeImplementation.files.readTerminalArtifact.handler(
      wireRuntimeMethod('files.readTerminalArtifact', handleFilesReadTerminalArtifact)
    ),
    readTerminalArtifactPreview: runtimeImplementation.files.readTerminalArtifactPreview.handler(
      wireRuntimeMethod('files.readTerminalArtifactPreview', handleFilesReadTerminalArtifactPreview)
    ),
    writeTerminalArtifact: runtimeImplementation.files.writeTerminalArtifact.handler(
      wireRuntimeMethod('files.writeTerminalArtifact', handleFilesWriteTerminalArtifact)
    ),
    readPreview: runtimeImplementation.files.readPreview.handler(
      wireRuntimeMethod('files.readPreview', handleFilesReadPreview)
    ),
    readChunk: runtimeImplementation.files.readChunk.handler(
      wireRuntimeMethod('files.readChunk', handleFilesReadChunk)
    ),
    readDir: runtimeImplementation.files.readDir.handler(
      wireRuntimeMethod('files.readDir', handleFilesReadDir)
    ),
    browseServerDir: runtimeImplementation.files.browseServerDir.handler(
      wireRuntimeMethod('files.browseServerDir', handleFilesBrowseServerDir)
    ),
    search: runtimeImplementation.files.search.handler(
      wireRuntimeMethod('files.search', handleFilesSearch)
    ),
    listAll: runtimeImplementation.files.listAll.handler(
      wireRuntimeMethod('files.listAll', handleFilesListAll)
    ),
    listMarkdownDocuments: runtimeImplementation.files.listMarkdownDocuments.handler(
      wireRuntimeMethod('files.listMarkdownDocuments', handleFilesListMarkdownDocuments)
    ),
    stat: runtimeImplementation.files.stat.handler(
      wireRuntimeMethod('files.stat', handleFilesStat)
    ),
    write: runtimeImplementation.files.write.handler(
      wireRuntimeMethod('files.write', handleFilesWrite)
    ),
    writeBase64: runtimeImplementation.files.writeBase64.handler(
      wireRuntimeMethod('files.writeBase64', handleFilesWriteBase64)
    ),
    writeBase64Chunk: runtimeImplementation.files.writeBase64Chunk.handler(
      wireRuntimeMethod('files.writeBase64Chunk', handleFilesWriteBase64Chunk)
    ),
    createFile: runtimeImplementation.files.createFile.handler(
      wireRuntimeMethod('files.createFile', handleFilesCreateFile)
    ),
    createDir: runtimeImplementation.files.createDir.handler(
      wireRuntimeMethod('files.createDir', handleFilesCreateDir)
    ),
    createDirNoClobber: runtimeImplementation.files.createDirNoClobber.handler(
      wireRuntimeMethod('files.createDirNoClobber', handleFilesCreateDirNoClobber)
    ),
    commitUpload: runtimeImplementation.files.commitUpload.handler(
      wireRuntimeMethod('files.commitUpload', handleFilesCommitUpload)
    ),
    rename: runtimeImplementation.files.rename.handler(
      wireRuntimeMethod('files.rename', handleFilesRename)
    ),
    copy: runtimeImplementation.files.copy.handler(
      wireRuntimeMethod('files.copy', handleFilesCopy)
    ),
    delete: runtimeImplementation.files.delete.handler(
      wireRuntimeMethod('files.delete', handleFilesDelete)
    ),
    watch: runtimeImplementation.files.watch.handler(
      wireRuntimeStream('files.watch', handleFilesWatch)
    ),
    unwatch: runtimeImplementation.files.unwatch.handler(
      wireRuntimeMethod('files.unwatch', handleFilesUnwatch)
    ),
    readLogTail: runtimeImplementation.files.readLogTail.handler(
      wireRuntimeMethod('files.readLogTail', handleFilesReadLogTail)
    ),
    watchLogTail: runtimeImplementation.files.watchLogTail.handler(
      wireRuntimeStream('files.watchLogTail', handleFilesWatchLogTail)
    )
  }
} as const
