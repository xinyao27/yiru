import { stat } from 'node:fs/promises'

import type {
  RuntimeFileListResult,
  RuntimeFileOpenResult,
  RuntimeFileReadResult
} from '~shared/runtime-types'

import { isENOENT, resolveAuthorizedPath } from '../filesystem/auth'
import { listQuickOpenFiles } from '../filesystem/list-files'
import { rankRuntimeMobileFilePaths } from './mobile-file-path-search'
import { joinWorktreeRelativePath } from './relative-paths'
import { RuntimeFileCommandsContract } from './runtime-file-commands-contract'
import {
  MOBILE_FILE_LIST_LIMIT,
  MOBILE_FILE_PATH_SEARCH_CACHE_LIMIT,
  isMobilePreviewableImagePath
} from './runtime-file-foundation'
import {
  isSafeMobileRelativePath,
  isMobileMarkdownPath,
  isMobileBinaryPath,
  basenameFromRelativePath,
  readLocalMobileFile
} from './runtime-file-paths'
import { truncateMobileFilePreview } from './runtime-terminal-file-security'

export abstract class RuntimeFileCommandsLayer1 extends RuntimeFileCommandsContract {
  async listMobileFiles(worktreeSelector: string): Promise<RuntimeFileListResult> {
    const store = this.host.requireStore()
    const target = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    const { worktree } = target
    const files = await listQuickOpenFiles(worktree.path, store)
    const entries = files
      .filter((relativePath) => isSafeMobileRelativePath(relativePath))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, MOBILE_FILE_LIST_LIMIT)
      .map((relativePath) => ({
        relativePath,
        basename: basenameFromRelativePath(relativePath),
        kind: isMobileBinaryPath(relativePath) ? ('binary' as const) : ('text' as const)
      }))

    return {
      worktree: worktree.id,
      rootPath: worktree.path,
      files: entries,
      totalCount: files.length,
      truncated: files.length > MOBILE_FILE_LIST_LIMIT
    }
  }

  async searchMobileFilePaths(
    worktreeSelector: string,
    query: string,
    limit: number
  ): Promise<RuntimeFileListResult> {
    const store = this.host.requireStore()
    const target = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    const { worktree } = target
    const cacheKey = `local:${worktree.id}:${worktree.path}`
    const inventory = await this.mobileFilePathSearchCache.get(cacheKey, async () => {
      const listed = await listQuickOpenFiles(
        worktree.path,
        store,
        undefined,
        undefined,
        MOBILE_FILE_PATH_SEARCH_CACHE_LIMIT + 1
      )
      const safePaths = listed
        .filter((relativePath) => isSafeMobileRelativePath(relativePath))
        .sort((a, b) => a.localeCompare(b))
      return {
        paths: safePaths.slice(0, MOBILE_FILE_PATH_SEARCH_CACHE_LIMIT),
        totalCount: safePaths.length,
        truncated: safePaths.length > MOBILE_FILE_PATH_SEARCH_CACHE_LIMIT
      }
    })
    const matches = rankRuntimeMobileFilePaths(inventory.paths, query, limit)
    return {
      worktree: worktree.id,
      rootPath: worktree.path,
      files: matches.paths.map((relativePath) => ({
        relativePath,
        basename: basenameFromRelativePath(relativePath),
        kind: isMobileBinaryPath(relativePath) ? ('binary' as const) : ('text' as const)
      })),
      totalCount: matches.totalCount,
      truncated: inventory.truncated || matches.totalCount > limit
    }
  }

  async openMobileFile(
    worktreeSelector: string,
    relativePath: string
  ): Promise<RuntimeFileOpenResult> {
    const { worktree } = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    if (!isSafeMobileRelativePath(relativePath)) {
      throw new Error('invalid_relative_path')
    }
    // Previewable images open like text (the mobile viewer renders them via
    // files.readPreview); other binaries stay unavailable on mobile.
    const kind = isMobilePreviewableImagePath(relativePath)
      ? 'image'
      : isMobileBinaryPath(relativePath)
        ? 'binary'
        : isMobileMarkdownPath(relativePath)
          ? 'markdown'
          : 'text'
    if (kind === 'binary') {
      return { worktree: worktree.id, relativePath, kind, opened: false }
    }
    const filePath = joinWorktreeRelativePath(worktree.path, relativePath)
    // Why: CLI/agents treat opened:true as success. Stat first so missing paths
    // fail the RPC instead of creating a ghost editor tab that only errors on read.
    await this.assertMobileOpenTargetExists(filePath)
    // Why: the service's internal runtimeId is not a registered runtime env selector
    // (those live in yiru-environments.json). Passing it caused Unknown environment
    // errors on content load for CLI-initiated opens (via files.open from yiru cli
    // used by agents). Instead pass undefined so the renderer openFile falls back to
    // the current activeRuntimeEnvironmentId (or null), matching sidebar opens and
    // allowing correct routing for local vs remote envs.
    this.host.openFile(worktree.id, filePath, relativePath, undefined)
    return { worktree: worktree.id, relativePath, kind, opened: true }
  }

  protected async assertMobileOpenTargetExists(filePath: string): Promise<void> {
    try {
      await stat(await resolveAuthorizedPath(filePath, this.host.requireStore()))
    } catch (error) {
      if (isENOENT(error)) {
        throw new Error(`ENOENT: no such file or directory, open '${filePath}'`)
      }
      throw error
    }
  }

  async openMobileDiff(
    worktreeSelector: string,
    relativePath: string,
    staged: boolean
  ): Promise<RuntimeFileOpenResult> {
    const { worktree } = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    if (!isSafeMobileRelativePath(relativePath)) {
      throw new Error('invalid_relative_path')
    }
    const kind = isMobileBinaryPath(relativePath)
      ? 'binary'
      : isMobileMarkdownPath(relativePath)
        ? 'markdown'
        : 'text'
    const filePath = joinWorktreeRelativePath(worktree.path, relativePath)
    // Why: see openMobileFile; avoid stamping internal runtimeId as runtimeEnvironmentId.
    this.host.openDiff(worktree.id, filePath, relativePath, staged, undefined)
    return { worktree: worktree.id, relativePath, kind, opened: true }
  }

  async readMobileFile(
    worktreeSelector: string,
    relativePath: string
  ): Promise<RuntimeFileReadResult> {
    const store = this.host.requireStore()
    const target = await this.host.resolveRuntimeFileTarget(worktreeSelector)
    const { worktree } = target
    if (!isSafeMobileRelativePath(relativePath)) {
      throw new Error('invalid_relative_path')
    }
    if (isMobileBinaryPath(relativePath)) {
      throw new Error('binary_file')
    }

    const filePath = joinWorktreeRelativePath(worktree.path, relativePath)
    const content = await readLocalMobileFile(filePath, store)
    const truncated = truncateMobileFilePreview(content)

    return {
      worktree: worktree.id,
      relativePath,
      content: truncated.content,
      truncated: truncated.truncated,
      byteLength: truncated.byteLength
    }
  }
}
