import type { RuntimeFileReadChunkResult } from '~shared/runtime-types'

import { callRuntimeOrpc, isRuntimeOrpcErrorCode } from '../orpc-client'
import {
  getRuntimeFileArgs,
  hasRemoteRuntimeOwner,
  type RuntimeFileArgs,
  type RuntimeFileDownloadResult,
  type RuntimeFileOperationArgs
} from './context'
import { readRuntimeFilePreview } from './read'
import { shellFilesClient } from './shell-files'

const REMOTE_DOWNLOAD_CHUNK_BYTES = 384 * 1024
const REMOTE_DOWNLOAD_UPDATE_REQUIRED_MESSAGE =
  'Remote file download requires a newer runtime host. Update the runtime host and try again.'

export async function downloadRuntimeFile(
  context: RuntimeFileOperationArgs,
  filePath: string,
  suggestedName: string
): Promise<RuntimeFileDownloadResult> {
  const runtimeArgs = getRuntimeFileArgs(context, filePath)
  if (!runtimeArgs) {
    if (hasRemoteRuntimeOwner(context)) {
      throw new Error('Remote file is outside the owning runtime worktree')
    }
    const result = await readRuntimeFilePreview(context, filePath)
    return shellFilesClient.saveDownloadedFile({
      suggestedName,
      content: result.content,
      encoding: result.isBinary ? 'base64' : 'utf8'
    })
  }

  if (!(await remoteChunkedDownloadAvailable(runtimeArgs))) {
    return downloadRemoteFileViaPreview(runtimeArgs, suggestedName)
  }

  const download = await shellFilesClient.startDownloadedFile({ suggestedName })
  if (download.canceled) {
    return download
  }

  let finished = false
  try {
    let offset = 0
    for (;;) {
      const chunk = await readRemoteDownloadChunk(runtimeArgs, offset)
      if (chunk.bytesRead > 0) {
        await shellFilesClient.appendDownloadedFileChunk({
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
    const result = await shellFilesClient.finishDownloadedFile({
      transferId: download.transferId
    })
    finished = true
    return result
  } finally {
    if (!finished) {
      await shellFilesClient
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
  const runtimeArgs = getRuntimeFileArgs(context, filePath)
  if (!runtimeArgs) {
    throw new Error('Remote file is outside the owning runtime worktree')
  }
  let offset = 0
  let first = true
  for (;;) {
    const chunk = await readRemoteDownloadChunk(runtimeArgs, offset)
    if (chunk.bytesRead <= 0 && !chunk.eof) {
      throw new Error('Remote download stalled before reaching EOF')
    }
    await consume({ contentBase64: chunk.contentBase64, first, last: chunk.eof })
    first = false
    offset += chunk.bytesRead
    if (chunk.eof) {
      return
    }
  }
}

async function remoteChunkedDownloadAvailable(runtimeArgs: RuntimeFileArgs): Promise<boolean> {
  try {
    await callRuntimeOrpc(
      runtimeArgs.target,
      (client) => client.files.readChunk,
      {
        worktree: runtimeArgs.worktreeSelector,
        relativePath: runtimeArgs.relativePath,
        offset: 0,
        length: 1
      },
      { timeoutMs: 60_000 }
    )
    return true
  } catch (error) {
    if (isRuntimeOrpcErrorCode(error, 'method_not_found')) {
      return false
    }
    throw error
  }
}

async function readRemoteDownloadChunk(
  runtimeArgs: RuntimeFileArgs,
  offset: number
): Promise<RuntimeFileReadChunkResult> {
  return callRuntimeOrpc(
    runtimeArgs.target,
    (client) => client.files.readChunk,
    {
      worktree: runtimeArgs.worktreeSelector,
      relativePath: runtimeArgs.relativePath,
      offset,
      length: REMOTE_DOWNLOAD_CHUNK_BYTES
    },
    { timeoutMs: 60_000 }
  )
}

async function downloadRemoteFileViaPreview(
  runtimeArgs: RuntimeFileArgs,
  suggestedName: string
): Promise<RuntimeFileDownloadResult> {
  try {
    const result = await callRuntimeOrpc(
      runtimeArgs.target,
      (client) => client.files.readPreview,
      { worktree: runtimeArgs.worktreeSelector, relativePath: runtimeArgs.relativePath },
      { timeoutMs: 15_000 }
    )
    // Why: old servers use an empty metadata-free binary result to signal an
    // unsupported binary; recognized zero-byte previews are still complete.
    if (result.isBinary && !result.content && !result.isImage && !result.mimeType) {
      throw new Error(REMOTE_DOWNLOAD_UPDATE_REQUIRED_MESSAGE)
    }
    return shellFilesClient.saveDownloadedFile({
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
