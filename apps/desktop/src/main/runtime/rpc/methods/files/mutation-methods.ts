import type {
  FileCommitUploadInput,
  FileCopyInput,
  FileDeleteInput,
  FileOpenInput,
  FileRenameInput,
  FileWriteBase64ChunkInput,
  FileWriteBase64Input,
  FileWriteInput
} from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../../core'

export async function handleFilesWrite(params: FileWriteInput, { fileCommands }: RpcContext) {
  return fileCommands.writeFileExplorerFile(params.worktree, params.relativePath, params.content)
}

export async function handleFilesWriteBase64(
  params: FileWriteBase64Input,
  { fileCommands }: RpcContext
) {
  return fileCommands.writeFileExplorerFileBase64(
    params.worktree,
    params.relativePath,
    params.contentBase64
  )
}

export async function handleFilesWriteBase64Chunk(
  params: FileWriteBase64ChunkInput,
  { fileCommands }: RpcContext
) {
  return fileCommands.writeFileExplorerFileBase64Chunk(
    params.worktree,
    params.relativePath,
    params.contentBase64,
    params.append === true
  )
}

export async function handleFilesCreateFile(params: FileOpenInput, { fileCommands }: RpcContext) {
  return fileCommands.createFileExplorerFile(params.worktree, params.relativePath)
}

export async function handleFilesCreateDir(params: FileOpenInput, { fileCommands }: RpcContext) {
  return fileCommands.createFileExplorerDir(params.worktree, params.relativePath)
}

export async function handleFilesCreateDirNoClobber(
  params: FileOpenInput,
  { fileCommands }: RpcContext
) {
  return fileCommands.createFileExplorerDirNoClobber(params.worktree, params.relativePath)
}

export async function handleFilesCommitUpload(
  params: FileCommitUploadInput,
  { fileCommands }: RpcContext
) {
  return fileCommands.commitFileExplorerUpload(
    params.worktree,
    params.tempRelativePath,
    params.finalRelativePath
  )
}

export async function handleFilesRename(params: FileRenameInput, { fileCommands }: RpcContext) {
  return fileCommands.renameFileExplorerPath(
    params.worktree,
    params.oldRelativePath,
    params.newRelativePath
  )
}

export async function handleFilesCopy(params: FileCopyInput, { fileCommands }: RpcContext) {
  return fileCommands.copyFileExplorerPath(
    params.worktree,
    params.sourceRelativePath,
    params.destinationRelativePath
  )
}

export async function handleFilesDelete(params: FileDeleteInput, { fileCommands }: RpcContext) {
  return fileCommands.deleteFileExplorerPath(params.worktree, params.relativePath, params.recursive)
}
