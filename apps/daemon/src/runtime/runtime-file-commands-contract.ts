import type { RuntimeTerminalPathResolution } from '@yiru/runtime-protocol/mobile-runtime-types'
import type {
  RuntimeFileListResult,
  RuntimeFileOpenResult,
  RuntimeFileReadChunkResult,
  RuntimeFilePreviewResult,
  RuntimeFileReadResult
} from '@yiru/runtime-protocol/workbench/runtime-types'
import type {
  DirEntry,
  FsChangeEvent,
  MarkdownDocument,
  SearchOptions,
  SearchResult
} from '@yiru/runtime-protocol/workbench/types'

import { RuntimeFileCommandsBase } from './runtime-file-commands-base'
import type { RuntimeFileStatLike, TerminalFileGrant } from './runtime-file-foundation'
import type {
  ResolvedRuntimeFileWorktree,
  ResolvedRuntimeFileTarget
} from './runtime-file-watcher-registry'

export abstract class RuntimeFileCommandsContract extends RuntimeFileCommandsBase {
  abstract listMobileFiles(worktreeSelector: string): Promise<RuntimeFileListResult>
  abstract searchMobileFilePaths(
    worktreeSelector: string,
    query: string,
    limit: number
  ): Promise<RuntimeFileListResult>
  abstract openMobileFile(
    worktreeSelector: string,
    relativePath: string
  ): Promise<RuntimeFileOpenResult>
  protected abstract assertMobileOpenTargetExists(filePath: string): Promise<void>
  abstract openMobileDiff(
    worktreeSelector: string,
    relativePath: string,
    staged: boolean
  ): Promise<RuntimeFileOpenResult>
  abstract readMobileFile(
    worktreeSelector: string,
    relativePath: string
  ): Promise<RuntimeFileReadResult>
  abstract resolveTerminalPath(
    worktreeSelector: string,
    pathText: string,
    cwd?: string | null,
    clientId?: string,
    terminalHandle?: string | null
  ): Promise<RuntimeTerminalPathResolution>
  protected abstract resolveAllowedTerminalArtifactPath(args: {
    absolutePath: string
    worktreePath: string
  }): Promise<string | null>
  protected abstract statLocalTerminalPath(
    absolutePath: string
  ): Promise<RuntimeFileStatLike & { isDirectory: () => boolean }>
  protected abstract createTerminalFileGrant(args: {
    worktreeId: string
    absolutePath: string
    provider: 'local'
    clientId?: string
    stats: RuntimeFileStatLike
  }): TerminalFileGrant
  protected abstract requireTerminalFileGrant(
    worktreeSelector: string,
    grantId: string,
    absolutePath: string,
    clientId?: string
  ): Promise<{ grant: TerminalFileGrant; target: ResolvedRuntimeFileTarget }>
  protected abstract refreshTerminalFileGrant(grant: TerminalFileGrant): void
  protected abstract pruneExpiredTerminalFileGrants(): void
  abstract revokeTerminalFileGrantsForClient(clientId: string): void
  protected abstract releaseTerminalFileGrant(id: string, grant: TerminalFileGrant): void
  protected abstract scheduleTerminalFileGrantExpiry(grant: TerminalFileGrant): void
  abstract readTerminalArtifactFile(
    worktreeSelector: string,
    grantId: string,
    absolutePath: string,
    clientId?: string
  ): Promise<RuntimeFileReadResult>
  abstract readTerminalArtifactPreview(
    worktreeSelector: string,
    grantId: string,
    absolutePath: string,
    clientId?: string
  ): Promise<RuntimeFilePreviewResult>
  abstract writeTerminalArtifactFile(
    worktreeSelector: string,
    grantId: string,
    absolutePath: string,
    content: string,
    clientId?: string
  ): Promise<{ ok: true }>
  abstract readFileExplorerDir(worktreeSelector: string, relativePath: string): Promise<DirEntry[]>
  abstract watchFileExplorer(
    worktreeSelector: string,
    callback: (events: FsChangeEvent[]) => void,
    onTerminalError?: (error: Error) => void,
    signal?: AbortSignal
  ): Promise<() => void>
  abstract closeFileExplorerWatchersForPath(rootPath: string): Promise<void>
  abstract restoreFileExplorerWatchersAfterFailedRemoval(rootPath: string): Promise<void>
  abstract forgetFileExplorerWatchersAfterRemoval(rootPath: string): void
  abstract readFileExplorerPreview(
    worktreeSelector: string,
    relativePath: string,
    grantedMaxBytes?: number
  ): Promise<RuntimeFilePreviewResult>
  abstract readFileExplorerChunk(
    worktreeSelector: string,
    relativePath: string,
    offset: number,
    length: number
  ): Promise<RuntimeFileReadChunkResult>
  abstract writeFileExplorerFile(
    worktreeSelector: string,
    relativePath: string,
    content: string
  ): Promise<{ ok: true }>
  abstract writeFileExplorerFileBase64(
    worktreeSelector: string,
    relativePath: string,
    contentBase64: string
  ): Promise<{ ok: true }>
  abstract writeFileExplorerFileBase64Chunk(
    worktreeSelector: string,
    relativePath: string,
    contentBase64: string,
    append: boolean
  ): Promise<{ ok: true }>
  abstract createFileExplorerFile(
    worktreeSelector: string,
    relativePath: string
  ): Promise<{ ok: true }>
  abstract createFileExplorerDir(
    worktreeSelector: string,
    relativePath: string
  ): Promise<{ ok: true }>
  abstract createFileExplorerDirNoClobber(
    worktreeSelector: string,
    relativePath: string
  ): Promise<{ ok: true }>
  abstract commitFileExplorerUpload(
    worktreeSelector: string,
    tempRelativePath: string,
    finalRelativePath: string
  ): Promise<{ ok: true }>
  abstract renameFileExplorerPath(
    worktreeSelector: string,
    oldRelativePath: string,
    newRelativePath: string
  ): Promise<{ ok: true }>
  abstract copyFileExplorerPath(
    worktreeSelector: string,
    sourceRelativePath: string,
    destinationRelativePath: string
  ): Promise<{ ok: true }>
  abstract deleteFileExplorerPath(
    worktreeSelector: string,
    relativePath: string,
    recursive?: boolean
  ): Promise<{ ok: true }>
  abstract searchRuntimeFiles(
    worktreeSelector: string,
    options: Omit<SearchOptions, 'rootPath'>
  ): Promise<SearchResult>
  abstract listRuntimeFiles(
    worktreeSelector: string,
    options?: { excludePaths?: string[] }
  ): Promise<string[]>
  abstract listRuntimeMarkdownDocuments(worktreeSelector: string): Promise<MarkdownDocument[]>
  abstract statRuntimeFile(
    worktreeSelector: string,
    relativePath: string
  ): Promise<{ size: number; isDirectory: boolean; mtime: number }>
  protected abstract searchLocalRuntimeFiles(
    rootPath: string,
    options: SearchOptions
  ): Promise<SearchResult>
  protected abstract resolveFileExplorerPath(
    worktreeSelector: string,
    relativePath: string
  ): Promise<{ worktree: ResolvedRuntimeFileWorktree; path: string }>
}
