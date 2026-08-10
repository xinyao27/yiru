import { isWindowsAbsolutePathLike, relativePathInsideRoot } from '@yiru/workbench-model/platform'
import { basename, joinPath, normalizeRelativePath } from '~renderer/lib/path'
import type {
  RuntimeFilePreviewResult,
  RuntimeFileReadChunkResult,
  RuntimeFileReadResult
} from '~shared/runtime-types'
/* eslint-disable max-lines -- Why: this client intentionally centralizes the
file preload API plus remote runtime fallbacks so call sites cannot drift on
local-vs-environment routing rules. */
import type {
  DirEntry,
  FsChangedPayload,
  GlobalSettings,
  MarkdownDocument,
  SearchOptions,
  SearchResult
} from '~shared/types'

import {
  createEmptyRuntimeFileSearchResult,
  getRuntimeFileSearchRejectedField
} from './file-search-bounds'
import {
  callRuntimeOrpc,
  createRuntimeOrpcClient,
  isRuntimeOrpcErrorCode,
  type RuntimeClientTarget
} from './orpc-client'
import { getActiveRuntimeTarget } from './rpc-client'
import { toRuntimeWorktreePathSelector, toRuntimeWorktreeSelector } from './worktree-selector'

export type RuntimeReadableFileContent = {
  content: string
  isBinary: boolean
  isImage?: boolean
  mimeType?: string
  fileIdentity?: string
}

export type RuntimeFileReadArgs = {
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
  filePath: string
  relativePath?: string
  worktreeId?: string
  connectionId?: string
  includeLocalLogMetadata?: boolean
}

export type RuntimeFileOperationArgs = {
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined
  worktreeId: string | null | undefined
  worktreePath: string | null | undefined
  connectionId?: string
}

export type RuntimeFileDownloadResult =
  | { canceled: true }
  | { canceled: false; destinationPath: string }

type StagedRuntimeImportSource =
  | {
      sourcePath: string
      status: 'staged'
      name: string
      kind: 'file' | 'directory'
      entries: StagedRuntimeImportEntry[]
    }
  | {
      sourcePath: string
      status: 'skipped'
      reason: 'missing' | 'symlink' | 'permission-denied' | 'unsupported'
    }
  | { sourcePath: string; status: 'failed'; reason: string }

type StagedRuntimeImportEntry =
  | { relativePath: string; kind: 'directory' }
  | { relativePath: string; kind: 'file'; contentBase64: string }

type RuntimeImportResult =
  | {
      sourcePath: string
      status: 'imported'
      destPath: string
      kind: 'file' | 'directory'
      renamed: boolean
    }
  | {
      sourcePath: string
      status: 'skipped'
      reason: 'missing' | 'symlink' | 'permission-denied' | 'unsupported'
    }
  | {
      sourcePath: string
      status: 'failed'
      reason: string
    }

type RuntimeFileWatchEvent =
  | { type: 'starting'; subscriptionId: string }
  | { type: 'ready'; subscriptionId: string }
  | { type: 'changed'; worktree: string; events: FsChangedPayload['events'] }
  | { type: 'error'; message: string }
  | { type: 'end' }

const REMOTE_UPLOAD_BASE64_CHUNK_CHARS = 512 * 1024
const REMOTE_DOWNLOAD_CHUNK_BYTES = 384 * 1024
const REMOTE_DOWNLOAD_UPDATE_REQUIRED_MESSAGE =
  'Remote file download requires a newer runtime host. Update the runtime host and try again.'

type RemoteFileDownloadArgs = NonNullable<ReturnType<typeof getRemoteFileArgs>>

type RuntimeFileWatchListener = {
  onPayload: (payload: FsChangedPayload) => void
  onError?: (error: Error) => void
}

type SharedRuntimeFileWatch = {
  target: RuntimeClientTarget
  worktreeId: string
  listeners: Set<RuntimeFileWatchListener>
  start: Promise<void>
  unsubscribe: (() => void) | null
  remoteSubscriptionId: string | null
  keepStreamUntilReady: boolean
  closed: boolean
}

const sharedRuntimeFileWatches = new Map<string, SharedRuntimeFileWatch>()

function getSharedRuntimeFileWatchKey(
  target: RuntimeClientTarget,
  worktreeId: string,
  worktreePath: string
): string {
  const targetKey = target.kind === 'environment' ? target.environmentId : 'local'
  return `${targetKey}\0${worktreeId}\0${worktreePath}`
}

export function getRuntimeFileReadScope(
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null | undefined,
  connectionId: string | undefined
): string | undefined {
  const target = getActiveRuntimeTarget(settings)
  return target.kind === 'environment' ? `runtime:${target.environmentId}` : connectionId
}

export async function readRuntimeFileContent({
  settings,
  filePath,
  relativePath,
  worktreeId,
  connectionId,
  includeLocalLogMetadata
}: RuntimeFileReadArgs): Promise<RuntimeReadableFileContent> {
  const target = getActiveRuntimeTarget(settings)
  if (!worktreeId) {
    return window.api.fileHost.readFile({ filePath, connectionId, includeLocalLogMetadata })
  }
  if (!canReadRelativeRuntimeFile(relativePath)) {
    // Why: a local target's filesystem is always reachable through the preload
    // fallback, even for a path outside the active worktree. Only a genuine
    // remote/environment target has no other way to reach an out-of-worktree
    // path, since files.* addresses files as (worktree, worktree-relative path).
    if (target.kind !== 'environment') {
      return window.api.fileHost.readFile({ filePath, connectionId, includeLocalLogMetadata })
    }
    throw new Error('Remote file is outside the owning runtime worktree')
  }

  const worktree = toRuntimeWorktreeSelector(worktreeId)
  let result: RuntimeFileReadResult
  try {
    result = await callRuntimeOrpc(
      target,
      (client) => client.files.read,
      { worktree, relativePath },
      { timeoutMs: 15_000 }
    )
  } catch (err) {
    // Why: files.read rejects binary paths with the typed 'binary_file' error; fall
    // back to the base64 preview RPC so PDFs/images render like local/SSH paths.
    // Match the exact typed error so an unrelated failure can't spoof the fallback.
    if (
      isRuntimeOrpcErrorCode(err, 'runtime_error') &&
      err instanceof Error &&
      err.message === 'binary_file'
    ) {
      return callRuntimeOrpc(
        target,
        (client) => client.files.readPreview,
        { worktree, relativePath },
        { timeoutMs: 15_000 }
      )
    }
    throw err
  }
  if (result.truncated) {
    // Why: the runtime file RPC is preview-sized today; treating a truncated
    // payload as editable content would make saves overwrite the rest of the file.
    throw new Error(`Remote file is too large to open in the editor (${result.byteLength} bytes)`)
  }
  return { content: result.content, isBinary: false }
}

export async function readRuntimeFilePreview(
  context: RuntimeFileOperationArgs,
  filePath: string
): Promise<RuntimeFilePreviewResult> {
  const remoteArgs = getRemoteFileArgs(context, filePath)
  if (!remoteArgs) {
    if (hasRemoteRuntimeOwner(context)) {
      throw new Error('Remote file is outside the owning runtime worktree')
    }
    return window.api.fileHost.readFile({ filePath, connectionId: context.connectionId })
  }
  return callRuntimeOrpc(
    remoteArgs.target,
    (client) => client.files.readPreview,
    { worktree: remoteArgs.worktreeSelector, relativePath: remoteArgs.relativePath },
    { timeoutMs: 15_000 }
  )
}

export async function downloadRuntimeFile(
  context: RuntimeFileOperationArgs,
  filePath: string,
  suggestedName: string
): Promise<RuntimeFileDownloadResult> {
  const remoteArgs = getRemoteFileArgs(context, filePath)
  if (!remoteArgs) {
    if (hasRemoteRuntimeOwner(context)) {
      throw new Error('Remote file is outside the owning runtime worktree')
    }
    const result = await readRuntimeFilePreview(context, filePath)
    return window.api.fileHost.saveDownloadedFile({
      suggestedName,
      content: result.content,
      encoding: result.isBinary ? 'base64' : 'utf8'
    })
  }

  if (!(await remoteChunkedDownloadAvailable(remoteArgs))) {
    return downloadRemoteFileViaPreview(remoteArgs, suggestedName)
  }

  const download = await window.api.fileHost.startDownloadedFile({ suggestedName })
  if (download.canceled) {
    return download
  }

  let finished = false
  try {
    let offset = 0
    for (;;) {
      const chunk = await readRemoteDownloadChunk(remoteArgs, offset)
      if (chunk.bytesRead > 0) {
        await window.api.fileHost.appendDownloadedFileChunk({
          transferId: download.transferId,
          contentBase64: chunk.contentBase64
        })
      }
      offset += chunk.bytesRead
      if (chunk.eof) {
        break
      }
      if (chunk.bytesRead <= 0) {
        throw new Error('Remote download stalled before reaching EOF')
      }
    }
    const result = await window.api.fileHost.finishDownloadedFile({
      transferId: download.transferId
    })
    finished = true
    return result
  } finally {
    if (!finished) {
      await window.api.fileHost
        .cancelDownloadedFile({ transferId: download.transferId })
        .catch(() => {})
    }
  }
}

export async function streamRuntimeFileDownloadChunks(
  context: RuntimeFileOperationArgs,
  filePath: string,
  consume: (chunk: { contentBase64: string; first: boolean; last: boolean }) => Promise<void>
): Promise<void> {
  const remoteArgs = getRemoteFileArgs(context, filePath)
  if (!remoteArgs) {
    throw new Error('Remote file is outside the owning runtime worktree')
  }
  let offset = 0
  let first = true
  for (;;) {
    const chunk = await readRemoteDownloadChunk(remoteArgs, offset)
    if (chunk.bytesRead <= 0 && !chunk.eof) {
      throw new Error('Remote download stalled before reaching EOF')
    }
    await consume({
      contentBase64: chunk.contentBase64,
      first,
      last: chunk.eof
    })
    first = false
    offset += chunk.bytesRead
    if (chunk.eof) {
      return
    }
  }
}

async function remoteChunkedDownloadAvailable(
  remoteArgs: RemoteFileDownloadArgs
): Promise<boolean> {
  try {
    await callRuntimeOrpc(
      remoteArgs.target,
      (client) => client.files.readChunk,
      {
        worktree: remoteArgs.worktreeSelector,
        relativePath: remoteArgs.relativePath,
        offset: 0,
        length: 1
      },
      { timeoutMs: 60_000 }
    )
    return true
  } catch (error) {
    // Why: compatible older runtime hosts may lack chunked downloads while
    // still supporting preview-sized file reads that can complete the request.
    if (isRuntimeOrpcErrorCode(error, 'method_not_found')) {
      return false
    }
    throw error
  }
}

async function readRemoteDownloadChunk(
  remoteArgs: RemoteFileDownloadArgs,
  offset: number
): Promise<RuntimeFileReadChunkResult> {
  return callRuntimeOrpc(
    remoteArgs.target,
    (client) => client.files.readChunk,
    {
      worktree: remoteArgs.worktreeSelector,
      relativePath: remoteArgs.relativePath,
      offset,
      length: REMOTE_DOWNLOAD_CHUNK_BYTES
    },
    { timeoutMs: 60_000 }
  )
}

async function downloadRemoteFileViaPreview(
  remoteArgs: RemoteFileDownloadArgs,
  suggestedName: string
): Promise<RuntimeFileDownloadResult> {
  try {
    const result = await callRuntimeOrpc(
      remoteArgs.target,
      (client) => client.files.readPreview,
      { worktree: remoteArgs.worktreeSelector, relativePath: remoteArgs.relativePath },
      { timeoutMs: 15_000 }
    )
    // Why: old servers use an empty, metadata-free binary result to signal an
    // unsupported binary; recognized zero-byte previews are still complete.
    if (result.isBinary && !result.content && !result.isImage && !result.mimeType) {
      throw new Error(REMOTE_DOWNLOAD_UPDATE_REQUIRED_MESSAGE)
    }
    return window.api.fileHost.saveDownloadedFile({
      suggestedName,
      content: result.content,
      encoding: result.isBinary ? 'base64' : 'utf8'
    })
  } catch (error) {
    if (isUnsupportedRemotePreviewDownload(error)) {
      throw new Error(REMOTE_DOWNLOAD_UPDATE_REQUIRED_MESSAGE)
    }
    throw error
  }
}

function isUnsupportedRemotePreviewDownload(error: unknown): boolean {
  return (
    isRuntimeOrpcErrorCode(error, 'method_not_found') ||
    (isRuntimeOrpcErrorCode(error, 'runtime_error') &&
      error instanceof Error &&
      (error.message === 'file_too_large' || error.message === 'binary_file'))
  )
}

export async function readRuntimeDirectory(
  context: RuntimeFileOperationArgs,
  dirPath: string
): Promise<DirEntry[]> {
  const remoteArgs = getRemoteFileArgs(context, dirPath)
  if (!remoteArgs) {
    assertLocalFilesystemFallbackAllowed(context)
    throw new Error('Directory is outside an owning runtime worktree')
  }
  return callRuntimeOrpc(
    remoteArgs.target,
    (client) => client.files.readDir,
    { worktree: remoteArgs.worktreeSelector, relativePath: remoteArgs.relativePath },
    { timeoutMs: 15_000 }
  )
}

export async function writeRuntimeFile(
  context: RuntimeFileOperationArgs,
  filePath: string,
  content: string
): Promise<void> {
  const remoteArgs = getRemoteFileArgs(context, filePath)
  if (!remoteArgs) {
    assertLocalFilesystemFallbackAllowed(context)
    await window.api.fileHost.writeFile({ filePath, content, connectionId: context.connectionId })
    return
  }
  await callRuntimeOrpc(
    remoteArgs.target,
    (client) => client.files.write,
    { worktree: remoteArgs.worktreeSelector, relativePath: remoteArgs.relativePath, content },
    { timeoutMs: 15_000 }
  )
}

export async function createRuntimePath(
  context: RuntimeFileOperationArgs,
  path: string,
  kind: 'file' | 'directory'
): Promise<void> {
  const remoteArgs = getRemoteFileArgs(context, path)
  if (!remoteArgs) {
    assertLocalFilesystemFallbackAllowed(context)
    await (kind === 'directory'
      ? window.api.fileHost.createDir({ dirPath: path, connectionId: context.connectionId })
      : window.api.fileHost.createFile({ filePath: path, connectionId: context.connectionId }))
    return
  }
  const input = { worktree: remoteArgs.worktreeSelector, relativePath: remoteArgs.relativePath }
  await (kind === 'directory'
    ? callRuntimeOrpc(remoteArgs.target, (client) => client.files.createDir, input, {
        timeoutMs: 15_000
      })
    : callRuntimeOrpc(remoteArgs.target, (client) => client.files.createFile, input, {
        timeoutMs: 15_000
      }))
}

export async function renameRuntimePath(
  context: RuntimeFileOperationArgs,
  oldPath: string,
  newPath: string
): Promise<void> {
  const oldRemoteArgs = getRemoteFileArgs(context, oldPath)
  const newRelativePath = getRelativePathInsideWorktree(context.worktreePath, newPath)
  if (!oldRemoteArgs || newRelativePath === null) {
    assertLocalFilesystemFallbackAllowed(context)
    await window.api.fileHost.rename({ oldPath, newPath, connectionId: context.connectionId })
    return
  }
  await callRuntimeOrpc(
    oldRemoteArgs.target,
    (client) => client.files.rename,
    {
      worktree: oldRemoteArgs.worktreeSelector,
      oldRelativePath: oldRemoteArgs.relativePath,
      newRelativePath
    },
    { timeoutMs: 15_000 }
  )
}

export async function copyRuntimePath(
  context: RuntimeFileOperationArgs,
  sourcePath: string,
  destinationPath: string
): Promise<void> {
  const sourceArgs = getRemoteFileArgs(context, sourcePath)
  const destinationArgs = getRemoteFileArgs(context, destinationPath)
  if (!sourceArgs || !destinationArgs) {
    assertLocalFilesystemFallbackAllowed(context)
    await window.api.fileHost.copy({
      sourcePath,
      destinationPath,
      connectionId: context.connectionId
    })
    return
  }
  await callRuntimeOrpc(
    sourceArgs.target,
    (client) => client.files.copy,
    {
      worktree: sourceArgs.worktreeSelector,
      sourceRelativePath: sourceArgs.relativePath,
      destinationRelativePath: destinationArgs.relativePath
    },
    { timeoutMs: 15_000 }
  )
}

export async function deleteRuntimePath(
  context: RuntimeFileOperationArgs,
  targetPath: string,
  recursive?: boolean
): Promise<void> {
  const remoteArgs = getRemoteFileArgs(context, targetPath)
  if (!remoteArgs) {
    assertLocalFilesystemFallbackAllowed(context)
    await window.api.fileHost.deletePath({
      targetPath,
      connectionId: context.connectionId,
      recursive
    })
    return
  }
  await callRuntimeOrpc(
    remoteArgs.target,
    (client) => client.files.delete,
    { worktree: remoteArgs.worktreeSelector, relativePath: remoteArgs.relativePath, recursive },
    { timeoutMs: 15_000 }
  )
}

export async function deleteRuntimeRelativePath(
  context: RuntimeFileOperationArgs,
  relativePath: string,
  recursive?: boolean
): Promise<boolean> {
  const target = getActiveRuntimeTarget(context.settings)
  const worktreeSelector = getRuntimeFileWorktreeSelector(context)
  if (!worktreeSelector || !canReadRelativeRuntimeFile(relativePath)) {
    return false
  }
  await callRuntimeOrpc(
    target,
    (client) => client.files.delete,
    {
      worktree: worktreeSelector,
      relativePath: normalizeRelativePath(relativePath),
      recursive
    },
    { timeoutMs: 15_000 }
  )
  return true
}

export async function importExternalPathsToRuntime(
  context: RuntimeFileOperationArgs,
  sourcePaths: string[],
  destinationDir: string,
  _options?: { ensureDestinationDir?: boolean }
): Promise<{ results: RuntimeImportResult[] }> {
  const target = getActiveRuntimeTarget(context.settings)
  if (!context.worktreePath) {
    throw new Error('Import destination requires an owning runtime worktree')
  }

  const destinationArgs = getRemoteFileArgs(context, destinationDir)
  if (!destinationArgs) {
    throw new Error('Destination is outside the active runtime worktree')
  }

  const staged = await window.api.fileHost.stageExternalPathsForRuntimeUpload({ sourcePaths })
  const results: RuntimeImportResult[] = []
  const reservedNames = new Set<string>()

  await ensureRuntimeDirectory(context, destinationDir)

  for (const source of staged.sources as StagedRuntimeImportSource[]) {
    if (source.status !== 'staged') {
      results.push(source)
      continue
    }
    let createdDirectoryImportRoot: string | null = null
    try {
      const finalName = await deconflictRuntimeImportName(
        context,
        destinationDir,
        source.name,
        reservedNames
      )
      const destPath = joinPath(destinationDir, finalName)
      const destRelativePath = joinRuntimeRelativePath(destinationArgs.relativePath, finalName)
      for (const entry of source.entries) {
        const entryRelativePath = joinRuntimeRelativePath(destRelativePath, entry.relativePath)
        if (entry.kind === 'directory') {
          await callRuntimeOrpc(
            target,
            (client) => client.files.createDirNoClobber,
            {
              worktree: destinationArgs.worktreeSelector,
              relativePath: entryRelativePath
            },
            { timeoutMs: 15_000 }
          )
          if (source.kind === 'directory' && entry.relativePath === '') {
            createdDirectoryImportRoot = entryRelativePath
          }
          continue
        }
        await uploadRuntimeFileWithoutClobber(
          target,
          destinationArgs.worktreeSelector,
          entryRelativePath,
          entry.contentBase64
        )
      }
      reservedNames.add(finalName)
      results.push({
        sourcePath: source.sourcePath,
        status: 'imported',
        destPath,
        kind: source.kind,
        renamed: finalName !== source.name
      })
    } catch (error) {
      if (createdDirectoryImportRoot) {
        // Why: match local directory imports by removing the no-clobber root
        // Yiru created when a nested runtime upload fails halfway through.
        await callRuntimeOrpc(
          target,
          (client) => client.files.delete,
          {
            worktree: destinationArgs.worktreeSelector,
            relativePath: createdDirectoryImportRoot,
            recursive: true
          },
          { timeoutMs: 15_000 }
        ).catch(() => {})
      }
      results.push({
        sourcePath: source.sourcePath,
        status: 'failed',
        reason: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return { results }
}

async function uploadRuntimeFileWithoutClobber(
  target: RuntimeClientTarget,
  worktreeSelector: string,
  relativePath: string,
  contentBase64: string
): Promise<void> {
  const tempRelativePath = makeRuntimeUploadTempPath(relativePath)
  try {
    await writeRuntimeBase64File(target, worktreeSelector, tempRelativePath, contentBase64)
    await callRuntimeOrpc(
      target,
      (client) => client.files.commitUpload,
      {
        worktree: worktreeSelector,
        tempRelativePath,
        finalRelativePath: relativePath
      },
      { timeoutMs: 30_000 }
    )
  } finally {
    await callRuntimeOrpc(
      target,
      (client) => client.files.delete,
      {
        worktree: worktreeSelector,
        relativePath: tempRelativePath,
        recursive: false
      },
      { timeoutMs: 15_000 }
    ).catch(() => {})
  }
}

async function writeRuntimeBase64File(
  target: RuntimeClientTarget,
  worktreeSelector: string,
  relativePath: string,
  contentBase64: string
): Promise<void> {
  if (contentBase64.length <= REMOTE_UPLOAD_BASE64_CHUNK_CHARS) {
    await callRuntimeOrpc(
      target,
      (client) => client.files.writeBase64,
      { worktree: worktreeSelector, relativePath, contentBase64 },
      { timeoutMs: 30_000 }
    )
    return
  }

  for (let offset = 0; offset < contentBase64.length; offset += REMOTE_UPLOAD_BASE64_CHUNK_CHARS) {
    await callRuntimeOrpc(
      target,
      (client) => client.files.writeBase64Chunk,
      {
        worktree: worktreeSelector,
        relativePath,
        contentBase64: contentBase64.slice(offset, offset + REMOTE_UPLOAD_BASE64_CHUNK_CHARS),
        append: offset > 0
      },
      { timeoutMs: 30_000 }
    )
  }
}

function makeRuntimeUploadTempPath(relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath)
  const slashIndex = normalized.lastIndexOf('/')
  const dir = slashIndex === -1 ? '' : normalized.slice(0, slashIndex + 1)
  const leaf = slashIndex === -1 ? normalized : normalized.slice(slashIndex + 1)
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${dir}.${leaf}.yiru-upload-${nonce}`
}

async function ensureRuntimeDirectory(
  context: RuntimeFileOperationArgs,
  destinationDir: string
): Promise<void> {
  const destinationArgs = getRemoteFileArgs(context, destinationDir)
  if (!destinationArgs) {
    return
  }
  const parts = normalizeRelativePath(destinationArgs.relativePath)
    .split('/')
    .filter((part) => part.length > 0)
  let current = ''
  for (const part of parts) {
    current = joinRuntimeRelativePath(current, part)
    const absolutePath = joinPath(context.worktreePath ?? '', current)
    if (await runtimePathExists(context, absolutePath)) {
      continue
    }
    await callRuntimeOrpc(
      destinationArgs.target,
      (client) => client.files.createDir,
      { worktree: destinationArgs.worktreeSelector, relativePath: current },
      { timeoutMs: 15_000 }
    )
  }
}

export async function searchRuntimeFiles(
  context: RuntimeFileOperationArgs,
  options: SearchOptions
): Promise<SearchResult> {
  if (getRuntimeFileSearchRejectedField(options)) {
    return createEmptyRuntimeFileSearchResult()
  }
  const target = getActiveRuntimeTarget(context.settings)
  const worktreeSelector = getRuntimeFileWorktreeSelector(context)
  if (!worktreeSelector) {
    throw new Error('File search requires an owning runtime worktree')
  }
  const { rootPath: _rootPath, ...runtimeOptions } = options
  return callRuntimeOrpc(
    target,
    (client) => client.files.search,
    { worktree: worktreeSelector, ...runtimeOptions },
    { timeoutMs: 15_000 }
  )
}

export async function listRuntimeFiles(
  context: RuntimeFileOperationArgs,
  args: { rootPath: string; excludePaths?: string[]; requestToken?: string }
): Promise<string[]> {
  const target = getActiveRuntimeTarget(context.settings)
  const worktreeSelector = getRuntimeFileWorktreeSelector(context)
  if (!worktreeSelector) {
    throw new Error('File listing requires an owning runtime worktree')
  }
  return callRuntimeOrpc(
    target,
    (client) => client.files.listAll,
    {
      worktree: worktreeSelector,
      excludePaths: args.excludePaths
    },
    { timeoutMs: 15_000 }
  )
}

/**
 * Best-effort abort of an in-flight listRuntimeFiles call (#7721). Switching
 * workspaces must stop the previous workspace's full-tree scan — over SSH an
 * abandoned scan keeps loading the relay and starves fs.readDir/fs.stat.
 */
export function cancelRuntimeFileList(
  _context: RuntimeFileOperationArgs,
  _requestToken: string
): void {
  // Why: any runtime target (local or environment) routes files.listAll
  // through callRuntimeOrpc without a cancellation token, so it is bounded by
  // its own RPC timeout instead.
}

export async function listRuntimeMarkdownDocuments(
  context: RuntimeFileOperationArgs,
  _rootPath: string
): Promise<MarkdownDocument[]> {
  const target = getActiveRuntimeTarget(context.settings)
  const worktreeSelector = getRuntimeFileWorktreeSelector(context)
  if (!worktreeSelector) {
    throw new Error('Markdown listing requires an owning runtime worktree')
  }
  return callRuntimeOrpc(
    target,
    (client) => client.files.listMarkdownDocuments,
    { worktree: worktreeSelector },
    { timeoutMs: 15_000 }
  )
}

export async function statRuntimePath(
  context: RuntimeFileOperationArgs,
  absolutePath: string
): Promise<{ size: number; isDirectory: boolean; mtime: number }> {
  const remoteArgs = getRemoteFileArgs(context, absolutePath)
  if (!remoteArgs) {
    assertLocalFilesystemFallbackAllowed(context)
    return window.api.fileHost.stat({
      filePath: absolutePath,
      connectionId: context.connectionId
    })
  }
  return callRuntimeOrpc(
    remoteArgs.target,
    (client) => client.files.stat,
    { worktree: remoteArgs.worktreeSelector, relativePath: remoteArgs.relativePath },
    { timeoutMs: 15_000 }
  )
}

export async function subscribeRuntimeFileChanges(
  context: RuntimeFileOperationArgs,
  onPayload: (payload: FsChangedPayload) => void,
  onError?: (error: Error) => void
): Promise<() => void> {
  const target = getActiveRuntimeTarget(context.settings)
  if (!context.worktreeId || !context.worktreePath) {
    throw new Error('A runtime file watch requires an owning worktree')
  }

  const listener: RuntimeFileWatchListener = { onPayload, onError }
  const key = getSharedRuntimeFileWatchKey(target, context.worktreeId, context.worktreePath)
  let shared = sharedRuntimeFileWatches.get(key)
  if (!shared) {
    shared = createSharedRuntimeFileWatch(key, target, context.worktreeId, context.worktreePath)
    sharedRuntimeFileWatches.set(key, shared)
  }
  shared.listeners.add(listener)
  try {
    await shared.start
  } catch (err) {
    shared.listeners.delete(listener)
    throw err
  }

  return () => {
    const current = sharedRuntimeFileWatches.get(key)
    if (!current) {
      return
    }
    current.listeners.delete(listener)
    if (current.listeners.size === 0) {
      closeSharedRuntimeFileWatch(key, current)
    }
  }
}

function createSharedRuntimeFileWatch(
  key: string,
  target: RuntimeClientTarget,
  worktreeId: string,
  worktreePath: string
): SharedRuntimeFileWatch {
  const shared: SharedRuntimeFileWatch = {
    target,
    worktreeId,
    listeners: new Set(),
    start: Promise.resolve(),
    unsubscribe: null,
    remoteSubscriptionId: null,
    keepStreamUntilReady: isWebRuntimeFileWatchSharedSocket(),
    closed: false
  }
  // Why: editor reloads and the Explorer can watch the same remote worktree.
  // Keep one runtime WebSocket/server watcher and fan out events in renderer.
  shared.start = startSharedRuntimeFileWatch(key, shared, worktreePath).catch((err) => {
    failSharedRuntimeFileWatch(key, shared, err instanceof Error ? err : new Error(String(err)))
    throw err
  })
  return shared
}

async function startSharedRuntimeFileWatch(
  key: string,
  shared: SharedRuntimeFileWatch,
  worktreePath: string
): Promise<void> {
  const abort = new AbortController()
  const connection = await createRuntimeOrpcClient(shared.target, {
    timeoutMs: 15_000,
    signal: abort.signal
  })
  try {
    const stream = await connection.client.files.watch(
      { worktree: toRuntimeWorktreeSelector(shared.worktreeId) },
      { signal: abort.signal }
    )
    shared.unsubscribe = () => {
      abort.abort()
      connection.close()
    }
    if (shared.closed || sharedRuntimeFileWatches.get(key) !== shared) {
      shared.unsubscribe()
      shared.unsubscribe = null
      if (!shared.keepStreamUntilReady) {
        unwatchSharedRuntimeFileWatch(shared)
      }
      return
    }
    void consumeSharedRuntimeFileWatch(key, shared, worktreePath, stream).finally(() => {
      connection.close()
      if (sharedRuntimeFileWatches.get(key) === shared && !shared.closed) {
        sharedRuntimeFileWatches.delete(key)
        shared.closed = true
        shared.unsubscribe = null
      }
    })
  } catch (error) {
    connection.close()
    throw error
  }
}

async function consumeSharedRuntimeFileWatch(
  key: string,
  shared: SharedRuntimeFileWatch,
  worktreePath: string,
  stream: AsyncIterator<RuntimeFileWatchEvent> & AsyncIterable<RuntimeFileWatchEvent>
): Promise<void> {
  try {
    for await (const event of stream) {
      if (event.type === 'starting' || event.type === 'ready') {
        shared.remoteSubscriptionId = event.subscriptionId
        if (shared.closed) {
          shared.unsubscribe?.()
          shared.unsubscribe = null
          if (!shared.keepStreamUntilReady) {
            unwatchSharedRuntimeFileWatch(shared)
          }
        }
      } else if (event.type === 'changed') {
        for (const listener of Array.from(shared.listeners)) {
          listener.onPayload({ worktreePath, events: event.events })
        }
      } else if (event.type === 'error') {
        // Why: error listeners may synchronously retry. Evict the terminal watch
        // before callbacks run so the retry cannot join a stream awaiting `end`.
        failSharedRuntimeFileWatch(key, shared, new Error(event.message))
      } else if (event.type === 'end') {
        // Why: evict and release the transport before a later listener starts.
        if (sharedRuntimeFileWatches.get(key) === shared) {
          sharedRuntimeFileWatches.delete(key)
        }
        shared.closed = true
        const unsubscribe = shared.unsubscribe
        shared.unsubscribe = null
        shared.remoteSubscriptionId = null
        shared.listeners.clear()
        unsubscribe?.()
      }
    }
  } catch (error) {
    if (!shared.closed) {
      failSharedRuntimeFileWatch(
        key,
        shared,
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }
}

function failSharedRuntimeFileWatch(
  key: string,
  shared: SharedRuntimeFileWatch,
  error: Error
): void {
  if (sharedRuntimeFileWatches.get(key) === shared) {
    sharedRuntimeFileWatches.delete(key)
  }
  shared.closed = true
  shared.remoteSubscriptionId = null
  const unsubscribe = shared.unsubscribe
  shared.unsubscribe = null
  const listeners = Array.from(shared.listeners)
  shared.listeners.clear()
  unsubscribe?.()
  for (const listener of listeners) {
    listener.onError?.(error)
  }
}

function closeSharedRuntimeFileWatch(key: string, shared: SharedRuntimeFileWatch): void {
  if (shared.closed) {
    return
  }
  shared.closed = true
  sharedRuntimeFileWatches.delete(key)
  if (shared.keepStreamUntilReady) {
    // Why: WebRuntimeClient owns shared-socket file-watch cleanup, including
    // pre-ready cancellation ownership and late-ready files.unwatch.
    shared.unsubscribe?.()
    shared.unsubscribe = null
    return
  }
  shared.unsubscribe?.()
  shared.unsubscribe = null
  unwatchSharedRuntimeFileWatch(shared)
}

function isWebRuntimeFileWatchSharedSocket(): boolean {
  return Boolean((globalThis as { __YIRU_WEB_CLIENT__?: boolean }).__YIRU_WEB_CLIENT__)
}

function unwatchSharedRuntimeFileWatch(shared: SharedRuntimeFileWatch): void {
  if (!shared.remoteSubscriptionId) {
    return
  }
  void callRuntimeOrpc(
    shared.target,
    (client) => client.files.unwatch,
    { subscriptionId: shared.remoteSubscriptionId },
    { timeoutMs: 5_000 }
  ).catch(() => {})
}

export async function runtimePathExists(
  context: RuntimeFileOperationArgs,
  absolutePath: string
): Promise<boolean> {
  const remoteArgs = getRemoteFileArgs(context, absolutePath)
  if (!remoteArgs) {
    assertLocalFilesystemFallbackAllowed(context)
    return window.api.fileHost.pathExists({
      filePath: absolutePath,
      connectionId: context.connectionId
    })
  }

  try {
    await callRuntimeOrpc(
      remoteArgs.target,
      (client) => client.files.stat,
      { worktree: remoteArgs.worktreeSelector, relativePath: remoteArgs.relativePath },
      { timeoutMs: 15_000 }
    )
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
    if (
      message.includes('enoent') ||
      message.includes('not found') ||
      message.includes('no such file')
    ) {
      return false
    }
    throw err
  }
}

export function isRemoteRuntimeFileOperation(
  context: RuntimeFileOperationArgs,
  path: string
): boolean {
  return getRemoteFileArgs(context, path) !== null
}

function canReadRelativeRuntimeFile(relativePath: string | undefined): relativePath is string {
  return Boolean(relativePath && relativePath.trim() && !isAbsolutePathLike(relativePath))
}

function isAbsolutePathLike(value: string): boolean {
  return value.startsWith('/') || isWindowsAbsolutePathLike(value)
}

function getRemoteFileArgs(
  context: RuntimeFileOperationArgs,
  absolutePath: string
): {
  target: RuntimeClientTarget
  worktreeSelector: string
  relativePath: string
} | null {
  const target = getActiveRuntimeTarget(context.settings)
  const worktreeSelector = getRuntimeFileWorktreeSelector(context)
  if (!worktreeSelector) {
    return null
  }
  const relativePath = getRelativePathInsideWorktree(context.worktreePath, absolutePath)
  if (relativePath === null) {
    return null
  }
  return {
    target,
    worktreeSelector,
    relativePath
  }
}

function hasRemoteRuntimeOwner(context: RuntimeFileOperationArgs): boolean {
  return (
    getActiveRuntimeTarget(context.settings).kind === 'environment' &&
    Boolean(getRuntimeFileWorktreeSelector(context))
  )
}

function getRuntimeFileWorktreeSelector(context: RuntimeFileOperationArgs): string | null {
  if (context.worktreeId) {
    return toRuntimeWorktreeSelector(context.worktreeId)
  }
  return context.worktreePath ? toRuntimeWorktreePathSelector(context.worktreePath) : null
}

function assertLocalFilesystemFallbackAllowed(context: RuntimeFileOperationArgs): void {
  if (hasRemoteRuntimeOwner(context)) {
    throw new Error('Remote file is outside the owning runtime worktree')
  }
}

function getRelativePathInsideWorktree(
  worktreePath: string | null | undefined,
  absolutePath: string
): string | null {
  if (!worktreePath) {
    return null
  }
  return relativePathInsideRoot(worktreePath, absolutePath)
}

async function deconflictRuntimeImportName(
  context: RuntimeFileOperationArgs,
  destinationDir: string,
  originalName: string,
  reservedNames: Set<string>
): Promise<string> {
  if (
    !(await runtimePathExists(context, joinPath(destinationDir, originalName))) &&
    !reservedNames.has(originalName)
  ) {
    return originalName
  }

  const dotIndex = originalName.lastIndexOf('.')
  const hasMeaningfulExt = dotIndex > 0
  const stem = hasMeaningfulExt ? originalName.slice(0, dotIndex) : originalName
  const ext = hasMeaningfulExt ? originalName.slice(dotIndex) : ''
  let candidate = `${stem} copy${ext}`
  if (
    !(await runtimePathExists(context, joinPath(destinationDir, candidate))) &&
    !reservedNames.has(candidate)
  ) {
    return candidate
  }

  let counter = 2
  while (counter < 10000) {
    candidate = `${stem} copy ${counter}${ext}`
    if (
      !(await runtimePathExists(context, joinPath(destinationDir, candidate))) &&
      !reservedNames.has(candidate)
    ) {
      return candidate
    }
    counter += 1
  }
  throw new Error(`Could not generate a unique name for '${basename(originalName)}'`)
}

function joinRuntimeRelativePath(basePath: string, relativePath: string): string {
  const normalizedBase = normalizeRelativePath(basePath)
  const normalizedRelative = normalizeRelativePath(relativePath)
  if (!normalizedBase) {
    return normalizedRelative
  }
  if (!normalizedRelative) {
    return normalizedBase
  }
  return `${normalizedBase}/${normalizedRelative}`
}
