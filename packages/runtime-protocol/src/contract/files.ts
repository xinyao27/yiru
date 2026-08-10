import { eventIterator, type, type ContractRouter } from '@orpc/contract'

import { withAccess, type RuntimeProcedureMeta } from './access-meta.js'
import {
  FileCommitUploadInputSchema,
  FileCopyInputSchema,
  FileDeleteInputSchema,
  FileListAllInputSchema,
  FileLogTailReadInputSchema,
  FileLogTailWatchInputSchema,
  FileOpenDiffInputSchema,
  FileOpenInputSchema,
  FilePathSearchInputSchema,
  FileReadChunkInputSchema,
  FileRenameInputSchema,
  FileResolveTerminalPathInputSchema,
  FileSearchInputSchema,
  FileServerDirectoryInputSchema,
  FileTerminalArtifactInputSchema,
  FileTerminalArtifactWriteInputSchema,
  FileTreePathInputSchema,
  FileUnwatchInputSchema,
  FileWorktreeInputSchema,
  FileWriteBase64ChunkInputSchema,
  FileWriteBase64InputSchema,
  FileWriteInputSchema
} from './file-input.js'
import type {
  RuntimeDirectoryEntry,
  RuntimeFileListResult,
  RuntimeFileMutationResult,
  RuntimeFileOpenResult,
  RuntimeFilePreviewResult,
  RuntimeFileReadChunkResult,
  RuntimeFileReadResult,
  RuntimeFileSearchResult,
  RuntimeFileStatResult,
  RuntimeFileUnwatchResult,
  RuntimeFileWatchEvent,
  RuntimeMarkdownDocument,
  RuntimeServerDirectoryResult,
  RuntimeTerminalPathResolution,
  RuntimeLogTailReadResult,
  RuntimeLogTailWatchEvent
} from './file-result.js'

const FILE_READ_ACCESS = { scope: 'worktree', tier: 'read' } as const
const FILE_CONTROL_ACCESS = { scope: 'worktree', tier: 'control' } as const
const FILE_HOST_ACCESS = { scope: 'host', tier: 'host' } as const
const MOBILE_CLIENT = { mobile: true } as const

export const filesContract = {
  watch: withAccess(FILE_READ_ACCESS)
    .input(FileWorktreeInputSchema)
    .output(eventIterator(type<RuntimeFileWatchEvent>())),
  list: withAccess(FILE_READ_ACCESS, MOBILE_CLIENT)
    .input(FileWorktreeInputSchema)
    .output(type<RuntimeFileListResult>()),
  searchPaths: withAccess(FILE_READ_ACCESS, MOBILE_CLIENT)
    .input(FilePathSearchInputSchema)
    .output(type<RuntimeFileListResult>()),
  open: withAccess(FILE_READ_ACCESS, MOBILE_CLIENT)
    .input(FileOpenInputSchema)
    .output(type<RuntimeFileOpenResult>()),
  openDiff: withAccess(FILE_READ_ACCESS, MOBILE_CLIENT)
    .input(FileOpenDiffInputSchema)
    .output(type<RuntimeFileOpenResult>()),
  read: withAccess(FILE_READ_ACCESS, MOBILE_CLIENT)
    .input(FileOpenInputSchema)
    .output(type<RuntimeFileReadResult>()),
  resolveTerminalPath: withAccess(FILE_HOST_ACCESS, MOBILE_CLIENT)
    .input(FileResolveTerminalPathInputSchema)
    .output(type<RuntimeTerminalPathResolution>()),
  readTerminalArtifact: withAccess(FILE_HOST_ACCESS, MOBILE_CLIENT)
    .input(FileTerminalArtifactInputSchema)
    .output(type<RuntimeFileReadResult>()),
  readTerminalArtifactPreview: withAccess(FILE_HOST_ACCESS, MOBILE_CLIENT)
    .input(FileTerminalArtifactInputSchema)
    .output(type<RuntimeFilePreviewResult>()),
  writeTerminalArtifact: withAccess(FILE_HOST_ACCESS, MOBILE_CLIENT)
    .input(FileTerminalArtifactWriteInputSchema)
    .output(type<RuntimeFileMutationResult>()),
  readPreview: withAccess(FILE_READ_ACCESS, MOBILE_CLIENT)
    .input(FileOpenInputSchema)
    .output(type<RuntimeFilePreviewResult>()),
  readChunk: withAccess(FILE_READ_ACCESS, MOBILE_CLIENT)
    .input(FileReadChunkInputSchema)
    .output(type<RuntimeFileReadChunkResult>()),
  readDir: withAccess(FILE_READ_ACCESS, MOBILE_CLIENT)
    .input(FileTreePathInputSchema)
    .output(type<RuntimeDirectoryEntry[]>()),
  browseServerDir: withAccess(FILE_HOST_ACCESS, MOBILE_CLIENT)
    .input(FileServerDirectoryInputSchema)
    .output(type<RuntimeServerDirectoryResult>()),
  write: withAccess(FILE_CONTROL_ACCESS)
    .input(FileWriteInputSchema)
    .output(type<RuntimeFileMutationResult>()),
  writeBase64: withAccess(FILE_CONTROL_ACCESS)
    .input(FileWriteBase64InputSchema)
    .output(type<RuntimeFileMutationResult>()),
  writeBase64Chunk: withAccess(FILE_CONTROL_ACCESS)
    .input(FileWriteBase64ChunkInputSchema)
    .output(type<RuntimeFileMutationResult>()),
  createFile: withAccess(FILE_CONTROL_ACCESS, MOBILE_CLIENT)
    .input(FileOpenInputSchema)
    .output(type<RuntimeFileMutationResult>()),
  createDir: withAccess(FILE_CONTROL_ACCESS)
    .input(FileOpenInputSchema)
    .output(type<RuntimeFileMutationResult>()),
  createDirNoClobber: withAccess(FILE_CONTROL_ACCESS)
    .input(FileOpenInputSchema)
    .output(type<RuntimeFileMutationResult>()),
  commitUpload: withAccess(FILE_CONTROL_ACCESS)
    .input(FileCommitUploadInputSchema)
    .output(type<RuntimeFileMutationResult>()),
  rename: withAccess(FILE_CONTROL_ACCESS)
    .input(FileRenameInputSchema)
    .output(type<RuntimeFileMutationResult>()),
  copy: withAccess(FILE_CONTROL_ACCESS)
    .input(FileCopyInputSchema)
    .output(type<RuntimeFileMutationResult>()),
  delete: withAccess(FILE_CONTROL_ACCESS)
    .input(FileDeleteInputSchema)
    .output(type<RuntimeFileMutationResult>()),
  search: withAccess(FILE_READ_ACCESS)
    .input(FileSearchInputSchema)
    .output(type<RuntimeFileSearchResult>()),
  listAll: withAccess(FILE_READ_ACCESS).input(FileListAllInputSchema).output(type<string[]>()),
  listMarkdownDocuments: withAccess(FILE_READ_ACCESS)
    .input(FileWorktreeInputSchema)
    .output(type<RuntimeMarkdownDocument[]>()),
  stat: withAccess(FILE_READ_ACCESS)
    .input(FileTreePathInputSchema)
    .output(type<RuntimeFileStatResult>()),
  unwatch: withAccess(FILE_READ_ACCESS)
    .input(FileUnwatchInputSchema)
    .output(type<RuntimeFileUnwatchResult>()),
  // Why: AI-vault session logs are absolute host paths outside any worktree,
  // so these take host access; the handler still runs the same
  // `resolveAuthorizedPath` gate the IPC path uses.
  readLogTail: withAccess(FILE_HOST_ACCESS)
    .input(FileLogTailReadInputSchema)
    .output(type<RuntimeLogTailReadResult>()),
  watchLogTail: withAccess(FILE_HOST_ACCESS)
    .input(FileLogTailWatchInputSchema)
    .output(eventIterator(type<RuntimeLogTailWatchEvent>()))
} satisfies ContractRouter<RuntimeProcedureMeta>

export {
  FileCommitUploadInputSchema,
  FileCopyInputSchema,
  FileDeleteInputSchema,
  FileListAllInputSchema,
  FileLogTailReadInputSchema,
  FileLogTailWatchInputSchema,
  FileOpenDiffInputSchema,
  FileOpenInputSchema,
  FilePathSearchInputSchema,
  FileReadChunkInputSchema,
  FileRenameInputSchema,
  FileResolveTerminalPathInputSchema,
  FileSearchInputSchema,
  FileServerDirectoryInputSchema,
  FileTerminalArtifactInputSchema,
  FileTerminalArtifactWriteInputSchema,
  FileTreePathInputSchema,
  FileUnwatchInputSchema,
  FileWorktreeInputSchema,
  FileWriteBase64ChunkInputSchema,
  FileWriteBase64InputSchema,
  FileWriteInputSchema
} from './file-input.js'
export type {
  FileCommitUploadInput,
  FileCopyInput,
  FileDeleteInput,
  FileListAllInput,
  FileLogTailReadInput,
  FileLogTailWatchInput,
  FileOpenDiffInput,
  FileOpenInput,
  FilePathSearchInput,
  FileReadChunkInput,
  FileRenameInput,
  FileResolveTerminalPathInput,
  FileSearchInput,
  FileServerDirectoryInput,
  FileTerminalArtifactInput,
  FileTerminalArtifactWriteInput,
  FileTreePathInput,
  FileUnwatchInput,
  FileWorktreeInput,
  FileWriteBase64ChunkInput,
  FileWriteBase64Input,
  FileWriteInput
} from './file-input.js'
export type {
  RuntimeDirectoryEntry,
  RuntimeFileListEntry,
  RuntimeFileListResult,
  RuntimeFileMutationResult,
  RuntimeFileOpenResult,
  RuntimeFilePreviewResult,
  RuntimeFileReadChunkResult,
  RuntimeFileReadResult,
  RuntimeFileSearchResult,
  RuntimeFileStatResult,
  RuntimeFileUnwatchResult,
  RuntimeFileWatchEvent,
  RuntimeLogTailReadResult,
  RuntimeLogTailWatchEvent,
  RuntimeMarkdownDocument,
  RuntimeSearchFileResult,
  RuntimeSearchMatch,
  RuntimeServerDirectoryResult,
  RuntimeTerminalPathResolution
} from './file-result.js'
