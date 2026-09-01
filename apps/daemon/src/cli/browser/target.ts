import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'

import type { BrowserCliContext, BrowserCliTarget } from './context'
import { readBrowserFlag } from './input'

export async function resolveBrowserTarget(context: BrowserCliContext): Promise<BrowserCliTarget> {
  const page = readBrowserFlag(context.args, 'page')
  const explicitWorktree = readBrowserFlag(context.args, 'worktree')
  if (page && (!explicitWorktree || explicitWorktree === 'all')) {
    return { page }
  }
  const worktree = await resolveBrowserWorktree(context, explicitWorktree)
  return {
    ...(page ? { page } : {}),
    ...(worktree ? { worktree } : {})
  }
}

export async function resolveBrowserWorktree(
  context: BrowserCliContext,
  explicit = readBrowserFlag(context.args, 'worktree')
): Promise<string | undefined> {
  if (explicit === 'all') {
    return undefined
  }
  if (explicit && explicit !== 'active' && explicit !== 'current') {
    return normalizeExplicitWorktree(explicit)
  }
  return resolveCurrentWorktree(context)
}

export async function resolveBrowserUploadFiles(
  context: BrowserCliContext,
  files: string[]
): Promise<string[]> {
  const worktree = await findBrowserWorktree(context)
  if (!worktree) {
    throw new Error('browser_upload_worktree_required')
  }
  if (worktree.hostId && worktree.hostId !== 'local') {
    throw new Error('browser_upload_remote_transfer_unsupported')
  }
  const root = await realpath(worktree.path)
  return Promise.all(
    files.map(async (file) => {
      if (isAbsolute(file)) {
        throw new Error('browser_upload_path_must_be_worktree_relative')
      }
      const path = await realpath(resolve(root, file))
      if (!isPathInsideOrEqual(root, path)) {
        throw new Error('browser_upload_path_outside_worktree')
      }
      return path
    })
  )
}

export async function resolveBrowserFileTarget(
  context: BrowserCliContext
): Promise<BrowserCliTarget & { worktree: string }> {
  const target = await resolveBrowserTarget(context)
  const worktree = target.worktree ?? (await resolveBrowserWorktree(context))
  if (!worktree) {
    throw new Error('browser_file_worktree_required')
  }
  return { ...target, worktree }
}

async function resolveCurrentWorktree(context: BrowserCliContext): Promise<string | undefined> {
  const match = await findCurrentWorktree(context)
  return match ? `id:${match.id}` : undefined
}

async function findBrowserWorktree(context: BrowserCliContext) {
  const explicit = readBrowserFlag(context.args, 'worktree')
  if (!explicit || explicit === 'active' || explicit === 'current') {
    return findCurrentWorktree(context)
  }
  if (explicit === 'all') {
    return undefined
  }
  const selector = normalizeExplicitWorktree(explicit)
  const normalized = selector.startsWith('id:') ? selector.slice('id:'.length) : selector
  const result = await context.client.worktree.list({ limit: 500 })
  const matches = result.worktrees.filter(
    (worktree) =>
      worktree.id === normalized ||
      worktree.path === normalized ||
      worktree.branch === normalized ||
      worktree.displayName === normalized ||
      (selector.startsWith('path:') && worktree.path === selector.slice('path:'.length)) ||
      (selector.startsWith('branch:') && worktree.branch === selector.slice('branch:'.length)) ||
      (selector.startsWith('name:') && worktree.displayName === selector.slice('name:'.length))
  )
  if (matches.length !== 1) {
    throw new Error(matches.length === 0 ? 'worktree_not_found' : 'worktree_selector_ambiguous')
  }
  return matches[0]
}

async function findCurrentWorktree(context: BrowserCliContext) {
  const currentPath = resolve(process.cwd())
  const result = await context.client.worktree.list({ limit: 500 })
  let best: (typeof result.worktrees)[number] | undefined
  for (const worktree of result.worktrees) {
    if (worktree.hostId && worktree.hostId !== 'local') {
      continue
    }
    const worktreePath = resolve(worktree.path)
    if (!isPathInsideOrEqual(worktreePath, currentPath)) {
      continue
    }
    if (!best || worktreePath.length > best.path.length) {
      best = worktree
    }
  }
  return best
}

function normalizeExplicitWorktree(value: string): string {
  if (value.startsWith('path:')) {
    return `path:${resolve(value.slice('path:'.length))}`
  }
  return value
}

function isPathInsideOrEqual(parent: string, candidate: string): boolean {
  const child = relative(parent, candidate)
  return child === '' || (!isAbsolute(child) && child !== '..' && !child.startsWith(`..${sep}`))
}
