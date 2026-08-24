import { type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from '../access-meta.js'
import type {
  ShellFileDownloadCompleteResult,
  ShellFileDownloadResult,
  ShellFileDownloadSessionResult,
  ShellFileMutationResult,
  ShellFileReadChunkInput,
  ShellFileReadChunkResult,
  ShellFileReadInput,
  ShellFileReadResult,
  ShellFileStatResult,
  ShellResolveDroppedPathsResult,
  ShellStageExternalPathsResult
} from './file-types.js'

const SHELL_READ_ACCESS = {
  scope: 'host',
  tier: 'read',
  principals: ['local']
} as const
const SHELL_HOST_ACCESS = {
  scope: 'host',
  tier: 'host',
  principals: ['local']
} as const

// Why: shell procedures describe the OS host rendering this window. A mobile
// owner controls a runtime host but does not own this Electron renderer surface,
// so every leaf deliberately keeps the default `mobile: false` access metadata.
export const shellFilesContract = {
  read: withAccess(SHELL_READ_ACCESS)
    .input(type<ShellFileReadInput>())
    .output(type<ShellFileReadResult>()),
  readChunk: withAccess(SHELL_READ_ACCESS)
    .input(type<ShellFileReadChunkInput>())
    .output(type<ShellFileReadChunkResult>()),
  saveDownload: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ suggestedName: string; content: string; encoding: 'utf8' | 'base64' }>())
    .output(type<ShellFileDownloadResult>()),
  startDownload: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ suggestedName: string }>())
    .output(type<ShellFileDownloadSessionResult>()),
  appendDownloadChunk: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ transferId: string; contentBase64: string }>())
    .output(type<ShellFileMutationResult>()),
  finishDownload: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ transferId: string }>())
    .output(type<ShellFileDownloadCompleteResult>()),
  cancelDownload: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ transferId: string }>())
    .output(type<ShellFileMutationResult>()),
  startFolderDownload: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ suggestedName: string }>())
    .output(type<ShellFileDownloadSessionResult>()),
  createFolderDownloadDirectory: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ transferId: string; pathSegments: string[] }>())
    .output(type<ShellFileMutationResult>()),
  appendFolderDownloadFileChunk: withAccess(SHELL_HOST_ACCESS)
    .input(
      type<{
        transferId: string
        pathSegments: string[]
        contentBase64: string
        first: boolean
        last: boolean
      }>()
    )
    .output(type<ShellFileMutationResult>()),
  finishFolderDownload: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ transferId: string }>())
    .output(type<ShellFileDownloadCompleteResult>()),
  cancelFolderDownload: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ transferId: string }>())
    .output(type<ShellFileMutationResult>()),
  write: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ filePath: string; content: string }>())
    .output(type<void>()),
  createFile: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ filePath: string }>())
    .output(type<void>()),
  createDirectory: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ directoryPath: string }>())
    .output(type<void>()),
  rename: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ oldPath: string; newPath: string }>())
    .output(type<void>()),
  copy: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ sourcePath: string; destinationPath: string }>())
    .output(type<void>()),
  delete: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ targetPath: string; recursive?: boolean }>())
    .output(type<void>()),
  authorizeExternalPath: withAccess(SHELL_HOST_ACCESS)
    .input(type<{ targetPath: string }>())
    .output(type<void>()),
  stat: withAccess(SHELL_READ_ACCESS)
    .input(type<{ filePath: string }>())
    .output(type<ShellFileStatResult>()),
  pathExists: withAccess(SHELL_READ_ACCESS)
    .input(type<{ filePath: string }>())
    .output(type<boolean>()),
  stageExternalPathsForRuntimeUpload: withAccess(SHELL_READ_ACCESS)
    .input(type<{ sourcePaths: string[] }>())
    .output(type<ShellStageExternalPathsResult>()),
  resolveDroppedPathsForAgent: withAccess(SHELL_READ_ACCESS)
    .input(type<{ paths: string[]; worktreePath: string }>())
    .output(type<ShellResolveDroppedPathsResult>())
} satisfies ContractRouter<RuntimeProcedureMeta>

export type * from './file-types.js'
