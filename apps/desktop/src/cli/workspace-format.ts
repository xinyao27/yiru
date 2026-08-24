import type {
  RuntimeRepoList,
  RuntimeRepoSearchRefs,
  RuntimeWorktreeListResult,
  RuntimeWorktreePsResult
} from '~shared/runtime-types'
import type { MemorySnapshot, WorktreeMemory } from '~shared/types'

export function formatMemorySnapshot(snapshot: MemorySnapshot): string {
  const topWorktrees = [...snapshot.worktrees].sort((a, b) => b.memory - a.memory).slice(0, 10)
  const lines = [
    `collectedAt: ${new Date(snapshot.collectedAt).toISOString()}`,
    `totalMemory: ${formatByteCount(snapshot.totalMemory)}`,
    `totalCpu: ${formatCpu(snapshot.totalCpu)}`,
    [
      `hostUsed: ${formatByteCount(snapshot.host.usedMemory)}`,
      `/ ${formatByteCount(snapshot.host.totalMemory)}`,
      `(${snapshot.host.memoryUsagePercent.toFixed(1)}%)`
    ].join(' '),
    [
      `app: ${formatByteCount(snapshot.app.memory)}`,
      `(main ${formatByteCount(snapshot.app.main.memory)},`,
      `renderer ${formatByteCount(snapshot.app.renderer.memory)},`,
      `other ${formatByteCount(snapshot.app.other.memory)})`
    ].join(' '),
    `worktrees: ${snapshot.worktrees.length}`
  ]

  if (topWorktrees.length === 0) {
    lines.push('topWorktrees: none')
    return lines.join('\n')
  }

  lines.push('', 'Top worktrees:')
  for (const worktree of topWorktrees) {
    lines.push(formatWorktreeMemoryLine(worktree))
  }
  if (snapshot.worktrees.length > topWorktrees.length) {
    lines.push(`... ${snapshot.worktrees.length - topWorktrees.length} more worktrees`)
  }
  return lines.join('\n')
}

function formatWorktreeMemoryLine(worktree: WorktreeMemory): string {
  return [
    `- ${worktree.worktreeName}`,
    `${formatByteCount(worktree.memory)}`,
    `${formatCpu(worktree.cpu)}`,
    `${worktree.sessions.length} session${worktree.sessions.length === 1 ? '' : 's'}`
  ].join('  ')
}

function formatCpu(cpu: number): string {
  return `${cpu.toFixed(1)}%`
}

function formatByteCount(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const formatted = value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)
  return `${formatted} ${units[unitIndex]}`
}

export function formatWorktreePs(result: RuntimeWorktreePsResult): string {
  if (result.worktrees.length === 0) {
    return 'No worktrees found.'
  }
  const body = result.worktrees
    .map(
      (worktree) =>
        `${worktree.repo} ${worktree.branch}  live:${worktree.liveTerminalCount}  pty:${worktree.hasAttachedPty ? 'yes' : 'no'}  unread:${worktree.unread ? 'yes' : 'no'}\n${worktree.path}${worktree.preview ? `\npreview: ${worktree.preview}` : ''}`
    )
    .join('\n\n')
  return result.truncated
    ? `${body}\n\ntruncated: showing ${result.worktrees.length} of ${result.totalCount}`
    : body
}

export function formatRepoList(result: RuntimeRepoList): string {
  if (result.repos.length === 0) {
    return 'No repos found.'
  }
  return result.repos.map((repo) => `${repo.id}  ${repo.displayName}  ${repo.path}`).join('\n')
}

export function formatRepoShow(result: { repo: Record<string, unknown> }): string {
  return Object.entries(result.repo)
    .map(
      ([key, value]) =>
        `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`
    )
    .join('\n')
}

export function formatRepoRefs(result: RuntimeRepoSearchRefs): string {
  if (result.refs.length === 0) {
    return 'No refs found.'
  }
  return result.truncated ? `${result.refs.join('\n')}\n\ntruncated: yes` : result.refs.join('\n')
}

export function formatWorktreeList(result: RuntimeWorktreeListResult): string {
  if (result.worktrees.length === 0) {
    return 'No worktrees found.'
  }
  const body = result.worktrees
    .map((worktree) => {
      const childCount = worktree.childWorktreeIds?.length ?? 0
      return `${String(worktree.id)}  ${String(worktree.branch)}  ${String(worktree.path)}\ndisplayName: ${String(worktree.displayName ?? '')}\nparentWorktreeId: ${String(worktree.parentWorktreeId ?? 'null')}\nchildWorktreeIds: ${childCount > 0 ? worktree.childWorktreeIds.join(',') : '[]'}\ncomment: ${String(worktree.comment ?? '')}`
    })
    .join('\n\n')
  return result.truncated
    ? `${body}\n\ntruncated: showing ${result.worktrees.length} of ${result.totalCount}`
    : body
}

export function formatWorktreeShow(result: { worktree: object }): string {
  const worktree = result.worktree
  return Object.entries(worktree)
    .map(
      ([key, value]) =>
        `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`
    )
    .join('\n')
}
