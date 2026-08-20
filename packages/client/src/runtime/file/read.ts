import type { RuntimeFilePreviewResult, RuntimeFileReadResult } from '~shared/runtime-types'
import type { DirEntry } from '~shared/types'

import { callRuntimeOrpc, isRuntimeOrpcErrorCode } from '../orpc-client'
import { getActiveRuntimeTarget } from '../rpc-client'
import { toRuntimeWorktreeSelector } from '../worktree-selector'
import {
  assertNativeFileFallbackAllowed,
  canReadRelativeRuntimeFile,
  getRuntimeFileArgs,
  hasRemoteRuntimeOwner,
  type RuntimeFileOperationArgs,
  type RuntimeFileReadArgs,
  type RuntimeReadableFileContent
} from './context'
import { shellFilesClient } from './shell-files'

export async function readRuntimeFileContent({
  settings,
  filePath,
  relativePath,
  worktreeId,
  connectionId,
  includeLocalLogMetadata
}: RuntimeFileReadArgs): Promise<RuntimeReadableFileContent> {
  const target = getActiveRuntimeTarget(settings)
  if (!worktreeId || !canReadRelativeRuntimeFile(relativePath)) {
    if (worktreeId && target.kind === 'environment') {
      throw new Error('Remote file is outside the owning runtime worktree')
    }
    return shellFilesClient.readFile({ filePath, connectionId, includeLocalLogMetadata })
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
  } catch (error) {
    // Why: files.read rejects binary paths with a typed error; the preview
    // leaf carries the base64 payload needed by image and PDF renderers.
    if (
      isRuntimeOrpcErrorCode(error, 'runtime_error') &&
      error instanceof Error &&
      error.message === 'binary_file'
    ) {
      return callRuntimeOrpc(
        target,
        (client) => client.files.readPreview,
        { worktree, relativePath },
        { timeoutMs: 15_000 }
      )
    }
    throw error
  }
  if (result.truncated) {
    // Why: saving preview-sized content would overwrite the unread tail.
    throw new Error(`Remote file is too large to open in the editor (${result.byteLength} bytes)`)
  }
  return { content: result.content, isBinary: false }
}

export async function readRuntimeFilePreview(
  context: RuntimeFileOperationArgs,
  filePath: string
): Promise<RuntimeFilePreviewResult> {
  const runtimeArgs = getRuntimeFileArgs(context, filePath)
  if (!runtimeArgs) {
    if (hasRemoteRuntimeOwner(context)) {
      throw new Error('Remote file is outside the owning runtime worktree')
    }
    return shellFilesClient.readFile({ filePath, connectionId: context.connectionId })
  }
  return callRuntimeOrpc(
    runtimeArgs.target,
    (client) => client.files.readPreview,
    { worktree: runtimeArgs.worktreeSelector, relativePath: runtimeArgs.relativePath },
    { timeoutMs: 15_000 }
  )
}

export async function readRuntimeDirectory(
  context: RuntimeFileOperationArgs,
  dirPath: string
): Promise<DirEntry[]> {
  const runtimeArgs = getRuntimeFileArgs(context, dirPath)
  if (!runtimeArgs) {
    assertNativeFileFallbackAllowed(context)
    throw new Error('Directory is outside an owning runtime worktree')
  }
  return callRuntimeOrpc(
    runtimeArgs.target,
    (client) => client.files.readDir,
    { worktree: runtimeArgs.worktreeSelector, relativePath: runtimeArgs.relativePath },
    { timeoutMs: 15_000 }
  )
}

export async function statRuntimePath(
  context: RuntimeFileOperationArgs,
  absolutePath: string
): Promise<{ size: number; isDirectory: boolean; mtime: number }> {
  const runtimeArgs = getRuntimeFileArgs(context, absolutePath)
  if (!runtimeArgs) {
    assertNativeFileFallbackAllowed(context)
    return shellFilesClient.stat({ filePath: absolutePath, connectionId: context.connectionId })
  }
  return callRuntimeOrpc(
    runtimeArgs.target,
    (client) => client.files.stat,
    { worktree: runtimeArgs.worktreeSelector, relativePath: runtimeArgs.relativePath },
    { timeoutMs: 15_000 }
  )
}

export async function runtimePathExists(
  context: RuntimeFileOperationArgs,
  absolutePath: string
): Promise<boolean> {
  const runtimeArgs = getRuntimeFileArgs(context, absolutePath)
  if (!runtimeArgs) {
    assertNativeFileFallbackAllowed(context)
    return shellFilesClient.pathExists({
      filePath: absolutePath,
      connectionId: context.connectionId
    })
  }
  try {
    await callRuntimeOrpc(
      runtimeArgs.target,
      (client) => client.files.stat,
      { worktree: runtimeArgs.worktreeSelector, relativePath: runtimeArgs.relativePath },
      { timeoutMs: 15_000 }
    )
    return true
  } catch (error) {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    if (
      message.includes('enoent') ||
      message.includes('not found') ||
      message.includes('no such file')
    ) {
      return false
    }
    throw error
  }
}
