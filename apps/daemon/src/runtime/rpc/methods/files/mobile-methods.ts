import type {
  FileOpenDiffInput,
  FileOpenInput,
  FilePathSearchInput,
  FileReadChunkInput,
  FileResolveTerminalPathInput,
  FileServerDirectoryInput,
  FileTerminalArtifactInput,
  FileTerminalArtifactWriteInput,
  FileTreePathInput,
  FileWorktreeInput
} from '@yiru/runtime-protocol/contract'
import type { RpcContext } from '~main/runtime/rpc/core'

export async function handleFilesList(params: FileWorktreeInput, { fileCommands }: RpcContext) {
  return fileCommands.listMobileFiles(params.worktree)
}

export async function handleFilesSearchPaths(
  params: FilePathSearchInput,
  { fileCommands }: RpcContext
) {
  return fileCommands.searchMobileFilePaths(params.worktree, params.query, params.limit)
}

export async function handleFilesOpen(params: FileOpenInput, { fileCommands }: RpcContext) {
  return fileCommands.openMobileFile(params.worktree, params.relativePath)
}

export async function handleFilesOpenDiff(params: FileOpenDiffInput, { fileCommands }: RpcContext) {
  return fileCommands.openMobileDiff(params.worktree, params.relativePath, params.staged === true)
}

export async function handleFilesRead(params: FileOpenInput, { fileCommands }: RpcContext) {
  return fileCommands.readMobileFile(params.worktree, params.relativePath)
}

export async function handleFilesResolveTerminalPath(
  params: FileResolveTerminalPathInput,
  { fileCommands, clientId }: RpcContext
) {
  return fileCommands.resolveTerminalPath(
    params.worktree,
    params.pathText,
    params.cwd ?? null,
    clientId,
    params.terminal ?? null
  )
}

export async function handleFilesReadTerminalArtifact(
  params: FileTerminalArtifactInput,
  { fileCommands, clientId }: RpcContext
) {
  return fileCommands.readTerminalArtifactFile(
    params.worktree,
    params.grantId,
    params.absolutePath,
    clientId
  )
}

export async function handleFilesReadTerminalArtifactPreview(
  params: FileTerminalArtifactInput,
  { fileCommands, clientId }: RpcContext
) {
  return fileCommands.readTerminalArtifactPreview(
    params.worktree,
    params.grantId,
    params.absolutePath,
    clientId
  )
}

export async function handleFilesWriteTerminalArtifact(
  params: FileTerminalArtifactWriteInput,
  { fileCommands, clientId }: RpcContext
) {
  return fileCommands.writeTerminalArtifactFile(
    params.worktree,
    params.grantId,
    params.absolutePath,
    params.content,
    clientId
  )
}

export async function handleFilesReadPreview(params: FileOpenInput, context: RpcContext) {
  return context.fileCommands.readFileExplorerPreview(
    params.worktree,
    params.relativePath,
    undefined
  )
}

export async function handleFilesReadChunk(params: FileReadChunkInput, context: RpcContext) {
  return context.fileCommands.readFileExplorerChunk(
    params.worktree,
    params.relativePath,
    params.offset,
    params.length
  )
}

export async function handleFilesReadDir(params: FileTreePathInput, { fileCommands }: RpcContext) {
  return fileCommands.readFileExplorerDir(params.worktree, params.relativePath)
}

export async function handleFilesBrowseServerDir(
  params: FileServerDirectoryInput,
  { runtime }: RpcContext
) {
  return runtime.browseServerDir(params.path)
}
