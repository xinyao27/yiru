import { realpath } from 'node:fs/promises'
import { basename } from 'node:path'

import type { Repo } from '~shared/types'

import type {
  ClaudeUsageAttributedTurn,
  ClaudeUsageLocationBreakdown,
  ClaudeUsageParsedTurn
} from './types'

export type ClaudeUsageWorktreeRef = {
  repoId: string
  worktreeId: string
  path: string
  displayName: string
}

type WorktreeEntry = [string, ClaudeUsageWorktreeRef]

const sortedEntriesByLookup = new WeakMap<Map<string, ClaudeUsageWorktreeRef>, WorktreeEntry[]>()

export async function buildWorktreeLookup(
  worktrees: ClaudeUsageWorktreeRef[]
): Promise<Map<string, ClaudeUsageWorktreeRef>> {
  const lookup = new Map<string, ClaudeUsageWorktreeRef>()
  for (const worktree of worktrees) {
    lookup.set(await canonicalizePath(worktree.path), worktree)
  }
  return lookup
}

export async function attributeClaudeUsageTurns(
  turns: ClaudeUsageParsedTurn[],
  worktreeLookup: Map<string, ClaudeUsageWorktreeRef>
): Promise<ClaudeUsageAttributedTurn[]> {
  const attributed: ClaudeUsageAttributedTurn[] = []
  const canonicalCwdByPath = new Map<string, string>()
  for (const turn of turns) {
    const day = localDayFromTimestamp(turn.timestamp)
    if (!day) {
      continue
    }
    const location = await resolveTurnLocation(turn.cwd, worktreeLookup, canonicalCwdByPath)
    attributed.push({ ...turn, day, ...location })
  }
  return attributed
}

export function createWorktreeRefs(
  repos: Repo[],
  worktreesByRepo: Map<string, { path: string; worktreeId: string; displayName: string }[]>
): ClaudeUsageWorktreeRef[] {
  const refs: ClaudeUsageWorktreeRef[] = []
  for (const repo of repos) {
    for (const worktree of worktreesByRepo.get(repo.id) ?? []) {
      refs.push({ repoId: repo.id, ...worktree })
    }
  }
  return refs
}

export function getSessionProjectLabel(locationBreakdown: ClaudeUsageLocationBreakdown[]): string {
  if (locationBreakdown.length === 0) {
    return 'Unknown location'
  }
  return locationBreakdown.length === 1 ? locationBreakdown[0].projectLabel : 'Multiple locations'
}

export function getDefaultWorktreeLabel(pathValue: string): string {
  return basename(pathValue)
}

async function resolveTurnLocation(
  cwd: string | null,
  worktreeLookup: Map<string, ClaudeUsageWorktreeRef>,
  canonicalCwdByPath: Map<string, string>
): Promise<{
  projectKey: string
  projectLabel: string
  repoId: string | null
  worktreeId: string | null
}> {
  if (!cwd) {
    return {
      projectKey: 'unscoped',
      projectLabel: 'Unknown location',
      repoId: null,
      worktreeId: null
    }
  }
  let canonicalCwd = canonicalCwdByPath.get(cwd)
  if (canonicalCwd === undefined) {
    canonicalCwd = await canonicalizePath(cwd)
    canonicalCwdByPath.set(cwd, canonicalCwd)
  }
  const worktree = findContainingWorktree(canonicalCwd, worktreeLookup)
  if (worktree) {
    return {
      projectKey: `worktree:${worktree.worktreeId}`,
      projectLabel: worktree.displayName,
      repoId: worktree.repoId,
      worktreeId: worktree.worktreeId
    }
  }
  return {
    projectKey: `cwd:${normalizeComparablePath(cwd)}`,
    projectLabel: defaultProjectLabel(cwd),
    repoId: null,
    worktreeId: null
  }
}

function findContainingWorktree(
  cwd: string,
  lookup: Map<string, ClaudeUsageWorktreeRef>
): ClaudeUsageWorktreeRef | null {
  const exact = lookup.get(normalizeComparablePath(cwd))
  if (exact) {
    return exact
  }
  let entries = sortedEntriesByLookup.get(lookup)
  if (!entries) {
    entries = [...lookup.entries()].sort(
      ([leftPath], [rightPath]) => rightPath.length - leftPath.length
    )
    sortedEntriesByLookup.set(lookup, entries)
  }
  const normalizedCwd = normalizeComparablePath(cwd).replace(/\/+$/, '')
  for (const [worktreePath, worktree] of entries) {
    const normalizedWorktree = normalizeComparablePath(worktreePath).replace(/\/+$/, '')
    if (
      normalizedCwd === normalizedWorktree ||
      normalizedCwd.startsWith(`${normalizedWorktree}/`)
    ) {
      return worktree
    }
  }
  return null
}

async function canonicalizePath(pathValue: string): Promise<string> {
  try {
    return normalizeComparablePath(await realpath(pathValue))
  } catch {
    return normalizeComparablePath(pathValue)
  }
}

function normalizeComparablePath(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function defaultProjectLabel(cwd: string): string {
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts.length >= 2 ? parts.slice(-2).join('/') : (parts.at(-1) ?? cwd)
}

function localDayFromTimestamp(timestamp: string): string | null {
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
