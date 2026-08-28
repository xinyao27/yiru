import { randomUUID } from 'node:crypto'
import { chmod, constants, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'

import type {
  RuntimeFilePreviewResult,
  RuntimeFileReadResult
} from '@yiru/runtime-protocol/workbench/runtime-types'
import type { DirEntry, FsChangeEvent } from '@yiru/runtime-protocol/workbench/types'

import { resolveAuthorizedPath } from '../filesystem/auth'
import { beginWatcherInstall } from '../filesystem/watcher-removal-gate'
import {
  closeFileExplorerWatcherInWatcherProcess,
  watchFileExplorerInWatcherProcess
} from './file-watcher-host'
import { RuntimeFileCommandsLayer2 } from './runtime-file-commands-layer-2'
import {
  MOBILE_FILE_READ_MAX_BYTES,
  RUNTIME_PREVIEWABLE_BINARY_MAX_BYTES,
  runtimeFileWatcherLeasesByOwnerAndRoot,
  RUNTIME_PREVIEWABLE_BINARY_MIME_TYPES
} from './runtime-file-foundation'
import { isMobileBinaryPath, isRuntimeDirectoryEntry, isBinaryBuffer } from './runtime-file-paths'
import {
  runtimeWatcherReleaseKey,
  registerRuntimeFileWatcherRelease
} from './runtime-file-watcher-registry'
import { watchWindowsRuntimeFileExplorer } from './runtime-file-windows-watcher'
import {
  readLocalTerminalArtifactFileFromHandle,
  readLocalTerminalArtifactPreviewFromHandle,
  openLocalTerminalArtifactGrant
} from './runtime-terminal-file-read'
import {
  readFileHandleBufferBounded,
  terminalFileStatIdentity,
  assertTerminalFileGrantFresh,
  truncateMobileFilePreview
} from './runtime-terminal-file-security'

export abstract class RuntimeFileCommandsLayer3 extends RuntimeFileCommandsLayer2 {
  async readTerminalArtifactFile(
    worktreeSelector: string,
    grantId: string,
    absolutePath: string,
    clientId?: string
  ): Promise<RuntimeFileReadResult> {
    const { grant, target } = await this.requireTerminalFileGrant(
      worktreeSelector,
      grantId,
      absolutePath,
      clientId
    )
    if (isMobileBinaryPath(grant.absolutePath)) {
      throw new Error('binary_file')
    }
    const handle = await openLocalTerminalArtifactGrant(grant, constants.O_RDONLY)
    let content: string
    try {
      content = await readLocalTerminalArtifactFileFromHandle(handle, grant)
    } finally {
      await handle.close()
    }
    this.refreshTerminalFileGrant(grant)
    const truncated = truncateMobileFilePreview(content)

    return {
      worktree: target.worktree.id,
      relativePath: grant.absolutePath,
      content: truncated.content,
      truncated: truncated.truncated,
      byteLength: truncated.byteLength
    }
  }

  async readTerminalArtifactPreview(
    worktreeSelector: string,
    grantId: string,
    absolutePath: string,
    clientId?: string
  ): Promise<RuntimeFilePreviewResult> {
    const { grant } = await this.requireTerminalFileGrant(
      worktreeSelector,
      grantId,
      absolutePath,
      clientId
    )
    const handle = await openLocalTerminalArtifactGrant(grant, constants.O_RDONLY)
    try {
      const preview = await readLocalTerminalArtifactPreviewFromHandle(handle, grant)
      this.refreshTerminalFileGrant(grant)
      return preview
    } finally {
      await handle.close()
    }
  }

  async writeTerminalArtifactFile(
    worktreeSelector: string,
    grantId: string,
    absolutePath: string,
    content: string,
    clientId?: string
  ): Promise<{ ok: true }> {
    if (Buffer.byteLength(content, 'utf8') > MOBILE_FILE_READ_MAX_BYTES) {
      throw new Error('file_too_large')
    }
    const { grant } = await this.requireTerminalFileGrant(
      worktreeSelector,
      grantId,
      absolutePath,
      clientId
    )
    if (isMobileBinaryPath(grant.absolutePath)) {
      throw new Error('binary_file')
    }
    let originalMode: number | null = null
    const handle = await openLocalTerminalArtifactGrant(grant, constants.O_RDONLY)
    try {
      const fileStats = await handle.stat()
      originalMode = fileStats.mode
      if (fileStats.isDirectory()) {
        throw new Error('Cannot write to a directory')
      }
      if (fileStats.size > MOBILE_FILE_READ_MAX_BYTES) {
        throw new Error('file_too_large')
      }
      assertTerminalFileGrantFresh(grant, fileStats)
      if (
        isBinaryBuffer(await readFileHandleBufferBounded(handle, MOBILE_FILE_READ_MAX_BYTES + 1))
      ) {
        throw new Error('binary_file')
      }
    } finally {
      await handle.close()
    }
    const tempPath = join(
      dirname(grant.absolutePath),
      `.${basename(grant.absolutePath)}.${randomUUID()}.tmp`
    )
    try {
      await writeFile(tempPath, content, { encoding: 'utf-8', flag: 'wx' })
      if (typeof originalMode === 'number') {
        await chmod(tempPath, originalMode & 0o7777)
      }
      const freshHandle = await openLocalTerminalArtifactGrant(grant, constants.O_RDONLY)
      try {
        assertTerminalFileGrantFresh(grant, await freshHandle.stat())
      } finally {
        await freshHandle.close()
      }
      await rename(tempPath, grant.absolutePath)
      grant.statIdentity = terminalFileStatIdentity(
        await this.statLocalTerminalPath(grant.absolutePath)
      )
      this.refreshTerminalFileGrant(grant)
      return { ok: true }
    } finally {
      await rm(tempPath, { force: true }).catch(() => {})
    }
  }

  async readFileExplorerDir(worktreeSelector: string, relativePath: string): Promise<DirEntry[]> {
    const target = await this.resolveFileExplorerPath(worktreeSelector, relativePath)
    const dirPath = await resolveAuthorizedPath(target.path, this.host.requireStore())
    const entries = await readdir(dirPath, { withFileTypes: true })
    const mapped = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = join(dirPath, entry.name)
        return {
          name: entry.name,
          isDirectory: await isRuntimeDirectoryEntry(entry, entryPath),
          isSymlink: entry.isSymbolicLink()
        }
      })
    )
    return mapped.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
  }

  async watchFileExplorer(
    worktreeSelector: string,
    callback: (events: FsChangeEvent[]) => void,
    onTerminalError: (error: Error) => void = () => undefined,
    signal?: AbortSignal
  ): Promise<() => void> {
    const target = await this.resolveFileExplorerPath(worktreeSelector, '')
    const open = async (): Promise<{
      unsubscribe: () => Promise<void>
      rootPaths: string[]
    }> => {
      const finishInstall = beginWatcherInstall(target.path)
      try {
        const rootPath = await resolveAuthorizedPath(target.path, this.host.requireStore())
        const rootStats = await stat(rootPath)
        if (!rootStats.isDirectory()) {
          throw new Error('not_a_directory')
        }
        if (process.platform === 'win32') {
          const close = watchWindowsRuntimeFileExplorer(rootPath, callback, onTerminalError)
          return { unsubscribe: close, rootPaths: [target.path, rootPath] }
        }
        // Why: the forked watcher keeps the blocking crawl and native faults out
        // of the main/`serve` process (issues #5308 and #8212).
        const dispose = await watchFileExplorerInWatcherProcess(
          rootPath,
          callback,
          onTerminalError,
          signal
        )
        return { unsubscribe: dispose, rootPaths: [target.path, rootPath] }
      } finally {
        finishInstall()
      }
    }
    const initial = await open()
    return registerRuntimeFileWatcherRelease(
      this.host.getRuntimeId(),
      initial.rootPaths,
      initial.unsubscribe,
      async () => (await open()).unsubscribe,
      onTerminalError
    )
  }

  async closeFileExplorerWatchersForPath(rootPath: string): Promise<void> {
    const key = runtimeWatcherReleaseKey(this.host.getRuntimeId(), rootPath)
    const leases = runtimeFileWatcherLeasesByOwnerAndRoot.get(key)
    if (leases) {
      await Promise.all(Array.from(leases, (lease) => lease.suspend()))
    }
    // Why: setup can fail before registerRuntimeFileWatcherRelease publishes
    // its callback, while the host still retains an unkillable child owner.
    const resolvedRootPath = await resolveAuthorizedPath(rootPath, this.host.requireStore())
    await closeFileExplorerWatcherInWatcherProcess(resolvedRootPath)
  }

  async restoreFileExplorerWatchersAfterFailedRemoval(rootPath: string): Promise<void> {
    const key = runtimeWatcherReleaseKey(this.host.getRuntimeId(), rootPath)
    const leases = runtimeFileWatcherLeasesByOwnerAndRoot.get(key)
    if (leases) {
      await Promise.all(Array.from(leases, (lease) => lease.resume()))
    }
  }

  forgetFileExplorerWatchersAfterRemoval(rootPath: string): void {
    const key = runtimeWatcherReleaseKey(this.host.getRuntimeId(), rootPath)
    const leases = runtimeFileWatcherLeasesByOwnerAndRoot.get(key)
    if (leases) {
      for (const lease of Array.from(leases)) {
        lease.forget()
      }
    }
  }

  async readFileExplorerPreview(
    worktreeSelector: string,
    relativePath: string,
    grantedMaxBytes: number = RUNTIME_PREVIEWABLE_BINARY_MAX_BYTES
  ): Promise<RuntimeFilePreviewResult> {
    const target = await this.resolveFileExplorerPath(worktreeSelector, relativePath)
    const filePath = await resolveAuthorizedPath(target.path, this.host.requireStore())
    const fileStats = await stat(filePath)
    const mimeType = RUNTIME_PREVIEWABLE_BINARY_MIME_TYPES[extname(filePath).toLowerCase()]
    if (mimeType) {
      if (fileStats.size > Math.min(RUNTIME_PREVIEWABLE_BINARY_MAX_BYTES, grantedMaxBytes)) {
        throw new Error('file_too_large')
      }
      const buffer = await readFile(filePath)
      return {
        content: buffer.toString('base64'),
        isBinary: true,
        isImage: true,
        mimeType
      }
    }

    if (fileStats.size > Math.min(MOBILE_FILE_READ_MAX_BYTES, grantedMaxBytes)) {
      throw new Error('file_too_large')
    }
    const buffer = await readFile(filePath)
    if (isBinaryBuffer(buffer)) {
      return { content: '', isBinary: true }
    }
    return { content: buffer.toString('utf-8'), isBinary: false }
  }
}
