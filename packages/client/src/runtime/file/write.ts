import { normalizeRelativePath } from '~renderer/lib/path'

import { callRuntimeOrpc } from '../orpc-client'
import { getActiveRuntimeTarget } from '../rpc-client'
import {
  assertNativeFileFallbackAllowed,
  canReadRelativeRuntimeFile,
  getRelativePathInsideWorktree,
  getRuntimeFileArgs,
  getRuntimeFileWorktreeSelector,
  type RuntimeFileOperationArgs
} from './context'
import { getNativeFiles } from './native-files'

export async function writeRuntimeFile(
  context: RuntimeFileOperationArgs,
  filePath: string,
  content: string
): Promise<void> {
  const runtimeArgs = getRuntimeFileArgs(context, filePath)
  if (!runtimeArgs) {
    assertNativeFileFallbackAllowed(context)
    await getNativeFiles().writeFile({ filePath, content, connectionId: context.connectionId })
    return
  }
  await callRuntimeOrpc(
    runtimeArgs.target,
    (client) => client.files.write,
    { worktree: runtimeArgs.worktreeSelector, relativePath: runtimeArgs.relativePath, content },
    { timeoutMs: 15_000 }
  )
}

export async function createRuntimePath(
  context: RuntimeFileOperationArgs,
  path: string,
  kind: 'file' | 'directory'
): Promise<void> {
  const runtimeArgs = getRuntimeFileArgs(context, path)
  if (!runtimeArgs) {
    assertNativeFileFallbackAllowed(context)
    await (kind === 'directory'
      ? getNativeFiles().createDir({ dirPath: path, connectionId: context.connectionId })
      : getNativeFiles().createFile({ filePath: path, connectionId: context.connectionId }))
    return
  }
  const input = { worktree: runtimeArgs.worktreeSelector, relativePath: runtimeArgs.relativePath }
  await (kind === 'directory'
    ? callRuntimeOrpc(runtimeArgs.target, (client) => client.files.createDir, input, {
        timeoutMs: 15_000
      })
    : callRuntimeOrpc(runtimeArgs.target, (client) => client.files.createFile, input, {
        timeoutMs: 15_000
      }))
}

export async function renameRuntimePath(
  context: RuntimeFileOperationArgs,
  oldPath: string,
  newPath: string
): Promise<void> {
  const runtimeArgs = getRuntimeFileArgs(context, oldPath)
  const newRelativePath = getRelativePathInsideWorktree(context.worktreePath, newPath)
  if (!runtimeArgs || newRelativePath === null) {
    assertNativeFileFallbackAllowed(context)
    await getNativeFiles().rename({ oldPath, newPath, connectionId: context.connectionId })
    return
  }
  await callRuntimeOrpc(
    runtimeArgs.target,
    (client) => client.files.rename,
    {
      worktree: runtimeArgs.worktreeSelector,
      oldRelativePath: runtimeArgs.relativePath,
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
  const sourceArgs = getRuntimeFileArgs(context, sourcePath)
  const destinationArgs = getRuntimeFileArgs(context, destinationPath)
  if (!sourceArgs || !destinationArgs) {
    assertNativeFileFallbackAllowed(context)
    await getNativeFiles().copy({
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
  const runtimeArgs = getRuntimeFileArgs(context, targetPath)
  if (!runtimeArgs) {
    assertNativeFileFallbackAllowed(context)
    await getNativeFiles().deletePath({
      targetPath,
      connectionId: context.connectionId,
      recursive
    })
    return
  }
  await callRuntimeOrpc(
    runtimeArgs.target,
    (client) => client.files.delete,
    { worktree: runtimeArgs.worktreeSelector, relativePath: runtimeArgs.relativePath, recursive },
    { timeoutMs: 15_000 }
  )
}

export async function deleteRuntimeRelativePath(
  context: RuntimeFileOperationArgs,
  relativePath: string,
  recursive?: boolean
): Promise<boolean> {
  const worktree = getRuntimeFileWorktreeSelector(context)
  if (!worktree || !canReadRelativeRuntimeFile(relativePath)) {
    return false
  }
  await callRuntimeOrpc(
    getActiveRuntimeTarget(context.settings),
    (client) => client.files.delete,
    { worktree, relativePath: normalizeRelativePath(relativePath), recursive },
    { timeoutMs: 15_000 }
  )
  return true
}
