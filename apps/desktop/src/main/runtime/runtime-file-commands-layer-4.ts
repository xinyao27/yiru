import {
  constants,
  cp,
  copyFile,
  lstat,
  mkdir,
  open,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { dirname } from 'node:path'

import { assertNoClobberRenameDestinationAvailable } from '~shared/filesystem-rename-collision'
import type { RuntimeFileReadChunkResult } from '~shared/runtime-types'
import type { MarkdownDocument, SearchOptions, SearchResult } from '~shared/types'

import { isENOENT, resolveAuthorizedPath } from '../filesystem/auth'
import { listQuickOpenFiles } from '../filesystem/list-files'
import { listMarkdownDocuments } from '../filesystem/markdown-documents'
import { RuntimeFileCommandsLayer3 } from './runtime-file-commands-layer-3'
import { assertRuntimePathDoesNotExist, rethrowRuntimeFileCreateError } from './runtime-file-paths'

export abstract class RuntimeFileCommandsLayer4 extends RuntimeFileCommandsLayer3 {
  async readFileExplorerChunk(
    worktreeSelector: string,
    relativePath: string,
    offset: number,
    length: number
  ): Promise<RuntimeFileReadChunkResult> {
    const target = await this.resolveFileExplorerPath(worktreeSelector, relativePath)
    const filePath = await resolveAuthorizedPath(target.path, this.host.requireStore())
    const fileStats = await stat(filePath)
    if (fileStats.isDirectory()) {
      throw new Error('Cannot download a directory')
    }
    const handle = await open(filePath, 'r')
    try {
      const buffer = Buffer.alloc(Math.min(length, Math.max(0, fileStats.size - offset)))
      const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, offset)
      const chunk = buffer.subarray(0, bytesRead)
      return {
        contentBase64: chunk.toString('base64'),
        bytesRead,
        eof: offset + bytesRead >= fileStats.size
      }
    } finally {
      await handle.close()
    }
  }

  async writeFileExplorerFile(
    worktreeSelector: string,
    relativePath: string,
    content: string
  ): Promise<{ ok: true }> {
    const target = await this.resolveFileExplorerPath(worktreeSelector, relativePath)
    const filePath = await resolveAuthorizedPath(target.path, this.host.requireStore())
    try {
      const fileStats = await lstat(filePath)
      if (fileStats.isDirectory()) {
        throw new Error('Cannot write to a directory')
      }
    } catch (error) {
      if (!isENOENT(error)) {
        throw error
      }
    }
    await writeFile(filePath, content, 'utf-8')
    return { ok: true }
  }

  async writeFileExplorerFileBase64(
    worktreeSelector: string,
    relativePath: string,
    contentBase64: string
  ): Promise<{ ok: true }> {
    const target = await this.resolveFileExplorerPath(worktreeSelector, relativePath)
    const content = Buffer.from(contentBase64, 'base64')
    const filePath = await resolveAuthorizedPath(target.path, this.host.requireStore())
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, content, { flag: 'wx' })
    return { ok: true }
  }

  async writeFileExplorerFileBase64Chunk(
    worktreeSelector: string,
    relativePath: string,
    contentBase64: string,
    append: boolean
  ): Promise<{ ok: true }> {
    const target = await this.resolveFileExplorerPath(worktreeSelector, relativePath)
    const content = Buffer.from(contentBase64, 'base64')
    const filePath = await resolveAuthorizedPath(target.path, this.host.requireStore())
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, content, { flag: append ? 'a' : 'wx' })
    return { ok: true }
  }

  async createFileExplorerFile(
    worktreeSelector: string,
    relativePath: string
  ): Promise<{ ok: true }> {
    const target = await this.resolveFileExplorerPath(worktreeSelector, relativePath)
    const filePath = await resolveAuthorizedPath(target.path, this.host.requireStore())
    await mkdir(dirname(filePath), { recursive: true })
    try {
      await writeFile(filePath, '', { encoding: 'utf-8', flag: 'wx' })
    } catch (error) {
      rethrowRuntimeFileCreateError(error, filePath)
    }
    return { ok: true }
  }

  async createFileExplorerDir(
    worktreeSelector: string,
    relativePath: string
  ): Promise<{ ok: true }> {
    const target = await this.resolveFileExplorerPath(worktreeSelector, relativePath)
    const dirPath = await resolveAuthorizedPath(target.path, this.host.requireStore())
    await assertRuntimePathDoesNotExist(dirPath)
    await mkdir(dirPath, { recursive: false })
    return { ok: true }
  }

  async createFileExplorerDirNoClobber(
    worktreeSelector: string,
    relativePath: string
  ): Promise<{ ok: true }> {
    const target = await this.resolveFileExplorerPath(worktreeSelector, relativePath)
    const dirPath = await resolveAuthorizedPath(target.path, this.host.requireStore())
    await mkdir(dirPath, { recursive: false })
    return { ok: true }
  }

  async commitFileExplorerUpload(
    worktreeSelector: string,
    tempRelativePath: string,
    finalRelativePath: string
  ): Promise<{ ok: true }> {
    const tempTarget = await this.resolveFileExplorerPath(worktreeSelector, tempRelativePath)
    const finalTarget = await this.resolveFileExplorerPath(worktreeSelector, finalRelativePath)
    const store = this.host.requireStore()
    const tempPath = await resolveAuthorizedPath(tempTarget.path, store)
    const finalPath = await resolveAuthorizedPath(finalTarget.path, store)
    await mkdir(dirname(finalPath), { recursive: true })
    await copyFile(tempPath, finalPath, constants.COPYFILE_EXCL)
    await rm(tempPath, { force: true })
    return { ok: true }
  }

  async renameFileExplorerPath(
    worktreeSelector: string,
    oldRelativePath: string,
    newRelativePath: string
  ): Promise<{ ok: true }> {
    const oldTarget = await this.resolveFileExplorerPath(worktreeSelector, oldRelativePath)
    const newTarget = await this.resolveFileExplorerPath(worktreeSelector, newRelativePath)
    const store = this.host.requireStore()
    const oldPath = await resolveAuthorizedPath(oldTarget.path, store, { preserveSymlink: true })
    const newPath = await resolveAuthorizedPath(newTarget.path, store, { preserveSymlink: true })
    await assertNoClobberRenameDestinationAvailable(oldPath, newPath)
    await rename(oldPath, newPath)
    return { ok: true }
  }

  async copyFileExplorerPath(
    worktreeSelector: string,
    sourceRelativePath: string,
    destinationRelativePath: string
  ): Promise<{ ok: true }> {
    const sourceTarget = await this.resolveFileExplorerPath(worktreeSelector, sourceRelativePath)
    const destinationTarget = await this.resolveFileExplorerPath(
      worktreeSelector,
      destinationRelativePath
    )
    const store = this.host.requireStore()
    const sourcePath = await resolveAuthorizedPath(sourceTarget.path, store, {
      preserveSymlink: true
    })
    const destinationPath = await resolveAuthorizedPath(destinationTarget.path, store, {
      preserveSymlink: true
    })
    await mkdir(dirname(destinationPath), { recursive: true })
    const sourceStat = await lstat(sourcePath)
    // Why: runtime Explorer clipboard copy mirrors the local path: recurse
    // through folders, preserve links, and never replace an existing path.
    await (sourceStat.isDirectory() || sourceStat.isSymbolicLink()
      ? cp(sourcePath, destinationPath, {
          recursive: sourceStat.isDirectory(),
          dereference: false,
          errorOnExist: true,
          force: false
        })
      : copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL))
    return { ok: true }
  }

  async deleteFileExplorerPath(
    worktreeSelector: string,
    relativePath: string,
    recursive?: boolean
  ): Promise<{ ok: true }> {
    const target = await this.resolveFileExplorerPath(worktreeSelector, relativePath)
    const targetPath = await resolveAuthorizedPath(target.path, this.host.requireStore(), {
      preserveSymlink: true
    })
    // Why: a non-local runtime has no client OS Trash/Recycling Bin; server-side
    // file mutations are permanent and the renderer confirms before calling this.
    await rm(targetPath, { recursive: recursive === true, force: true })
    return { ok: true }
  }

  async searchRuntimeFiles(
    worktreeSelector: string,
    options: Omit<SearchOptions, 'rootPath'>
  ): Promise<SearchResult> {
    const target = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    const rootPath = target.worktree.path
    const searchOptions = { ...options, rootPath }
    return this.searchLocalRuntimeFiles(rootPath, searchOptions)
  }

  async listRuntimeFiles(
    worktreeSelector: string,
    options: { excludePaths?: string[] } = {}
  ): Promise<string[]> {
    const target = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    return listQuickOpenFiles(target.worktree.path, this.host.requireStore(), options.excludePaths)
  }

  async listRuntimeMarkdownDocuments(worktreeSelector: string): Promise<MarkdownDocument[]> {
    const target = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    return listMarkdownDocuments(target.worktree.path)
  }

  async statRuntimeFile(
    worktreeSelector: string,
    relativePath: string
  ): Promise<{ size: number; isDirectory: boolean; mtime: number }> {
    const target = await this.resolveFileExplorerPath(worktreeSelector, relativePath)
    const filePath = await resolveAuthorizedPath(target.path, this.host.requireStore())
    const stats = await stat(filePath)
    return { size: stats.size, isDirectory: stats.isDirectory(), mtime: stats.mtimeMs }
  }
}
