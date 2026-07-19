import { decodeGitCQuotedPath } from '../../shared/git-cquoted-path'
import type {
  SpoolGitHistoryEntry,
  SpoolGitStatusEntry,
  SpoolGitStatusResult
} from '../../shared/spool/spool-operation-contract'
import { StatusPorcelainParser } from '../git/status-porcelain-parser'
import { normalizeSpoolRelativePath } from './spool-worktree-containment'

const STATUS_ENTRY_LIMIT = 5_000
const OID_PATTERN = /^[0-9a-fA-F]{40,64}$/

export type SpoolRawHistoryEntry = {
  oid: string
  parentOids: readonly string[]
  subject: string
  message: string
  author: string | null
  committedAt: number | null
}

export function projectSpoolGitStatus(
  stdout: string,
  outputTruncated: boolean
): SpoolGitStatusResult {
  const parser = new StatusPorcelainParser()
  const stoppedAtLimit = parser.update(stdout, STATUS_ENTRY_LIMIT)
  if (!stoppedAtLimit && !outputTruncated) {
    parser.finish()
  }
  const entries = parser.entries
    .slice(0, STATUS_ENTRY_LIMIT)
    .map(projectStatusEntry)
    .filter((entry): entry is SpoolGitStatusEntry => entry !== null)
  const availableConflictSlots = Math.max(0, STATUS_ENTRY_LIMIT - entries.length)
  const unmergedTruncated = parser.unmergedLines.length > availableConflictSlots
  for (const line of parser.unmergedLines) {
    const relativePath = parseUnmergedPath(line)
    if (relativePath && entries.length < STATUS_ENTRY_LIMIT) {
      entries.push({
        relativePath,
        status: 'modified',
        area: 'unstaged',
        conflicted: true
      })
    }
  }
  const branch = parser.branch.branch?.replace(/^refs\/heads\//, '') ?? null
  const upstreamName = parser.branch.upstreamName
  const aheadBehind = parser.branch.upstreamAheadBehind
  return {
    branch,
    upstream:
      upstreamName && aheadBehind
        ? { name: upstreamName, ahead: aheadBehind.ahead, behind: aheadBehind.behind }
        : null,
    entries,
    truncated:
      outputTruncated ||
      stoppedAtLimit ||
      parser.statusLength > STATUS_ENTRY_LIMIT ||
      unmergedTruncated
  }
}

export function parseSpoolGitHistory(stdout: string): readonly SpoolRawHistoryEntry[] {
  const entries: SpoolRawHistoryEntry[] = []
  for (const rawRecord of stdout.split('\0')) {
    const record = rawRecord.replace(/^\n+/, '')
    if (!record.trim()) {
      continue
    }
    const lines = record.split('\n')
    const oid = lines[0]?.trim() ?? ''
    if (!OID_PATTERN.test(oid)) {
      continue
    }
    const author = lines[1]?.trim() || null
    const committedAtSeconds = Number.parseInt(lines[2] ?? '', 10)
    const parentOids = (lines[3] ?? '')
      .trim()
      .split(' ')
      .filter((parent) => OID_PATTERN.test(parent))
    const message = lines.slice(4).join('\n').replace(/\n$/, '')
    entries.push({
      oid,
      parentOids,
      subject: message.split(/\r?\n/, 1)[0]?.trim() || '(no commit message)',
      message,
      author,
      committedAt: Number.isFinite(committedAtSeconds) ? committedAtSeconds * 1_000 : null
    })
  }
  return entries
}

export function projectSpoolGitHistory(
  entries: readonly SpoolRawHistoryEntry[],
  references: ReadonlyMap<string, string>
): readonly SpoolGitHistoryEntry[] {
  return entries.flatMap((entry) => {
    const commitRef = references.get(entry.oid)
    if (!commitRef) {
      return []
    }
    return [
      {
        commitRef,
        parentRefs: entry.parentOids.flatMap((oid) => {
          const parentRef = references.get(oid)
          return parentRef ? [parentRef] : []
        }),
        subject: entry.subject,
        message: entry.message,
        author: entry.author,
        committedAt: entry.committedAt
      }
    ]
  })
}

function projectStatusEntry(entry: {
  path: string
  oldPath?: string
  status: SpoolGitStatusEntry['status']
  area: SpoolGitStatusEntry['area']
  conflictStatus?: string
}): SpoolGitStatusEntry | null {
  const relativePath = safeRelativePath(entry.path)
  const oldRelativePath = entry.oldPath ? safeRelativePath(entry.oldPath) : null
  if (!relativePath || (entry.oldPath && !oldRelativePath)) {
    return null
  }
  return {
    relativePath,
    ...(oldRelativePath ? { oldRelativePath } : {}),
    status: entry.status,
    area: entry.area,
    ...(entry.conflictStatus ? { conflicted: true } : {})
  }
}

function parseUnmergedPath(line: string): string | null {
  const fields = line.split(' ')
  return safeRelativePath(decodeGitCQuotedPath(fields.slice(10).join(' ')))
}

function safeRelativePath(value: string): string | null {
  try {
    return normalizeSpoolRelativePath(value)
  } catch {
    return null
  }
}
