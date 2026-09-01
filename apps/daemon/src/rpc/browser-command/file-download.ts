import { mkdir, realpath, rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

import type { BrowserSelectorPathInput } from '@yiru/runtime-protocol/contract'

import type { WorktreeCatalog } from '../../git/worktree/worktrees'

type BrowserDownloadDelegate = <TResult>(method: string, input: unknown) => Promise<TResult>

type ChromeDownloadReceipt = { sourcePath: string; token: string }

export class BrowserFileDownloadService {
  private readonly delegate: BrowserDownloadDelegate
  private readonly worktrees: WorktreeCatalog

  constructor(delegate: BrowserDownloadDelegate, worktrees: WorktreeCatalog) {
    this.delegate = delegate
    this.worktrees = worktrees
  }

  async download(input: BrowserSelectorPathInput): Promise<{ path: string }> {
    const destination = await this.resolveDestination(input)
    const receipt = await this.delegate<ChromeDownloadReceipt>('browser.download', input)
    if (
      !/^yiru-[0-9a-f-]{36}$/i.test(receipt.token) ||
      basename(receipt.sourcePath) !== receipt.token
    ) {
      throw new Error('browser_download_receipt_invalid')
    }
    const sourceFile = Bun.file(receipt.sourcePath)
    if (!(await sourceFile.exists())) {
      throw new Error('browser_download_file_missing')
    }
    try {
      await Bun.write(destination, sourceFile)
      return { path: input.path }
    } finally {
      await rm(receipt.sourcePath, { force: true })
    }
  }

  private async resolveDestination(input: BrowserSelectorPathInput): Promise<string> {
    if (!input.worktree) {
      throw new Error('browser_download_worktree_required')
    }
    if (isAbsolute(input.path)) {
      throw new Error('browser_download_path_must_be_worktree_relative')
    }
    const worktree = await this.worktrees.resolve(input.worktree)
    if (worktree.hostId && worktree.hostId !== 'local') {
      throw new Error('browser_download_remote_transfer_unsupported')
    }
    const root = await realpath(worktree.path)
    const destination = resolve(root, input.path)
    if (!isPathInsideOrEqual(root, destination)) {
      throw new Error('browser_download_path_outside_worktree')
    }
    const parent = dirname(destination)
    await mkdir(parent, { recursive: true })
    const canonicalParent = await realpath(parent)
    if (!isPathInsideOrEqual(root, canonicalParent)) {
      throw new Error('browser_download_path_outside_worktree')
    }
    return join(canonicalParent, basename(destination))
  }
}

function isPathInsideOrEqual(parent: string, candidate: string): boolean {
  const child = relative(parent, candidate)
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`))
}
