import type { RuntimeProjectSearchMatch } from '@yiru/runtime-protocol/contract'

import type { WorktreeCatalog } from '../git/worktree/worktrees'
import type { Host } from '../hosts/contract'
import type { HostRegistry } from '../hosts/registry'
import type { ProjectStore } from '../projects/store'

const SEARCH_RESULT_LIMIT = 100

export class SearchService {
  private readonly hosts: HostRegistry
  private readonly projects: ProjectStore
  private readonly worktrees: WorktreeCatalog

  constructor(projects: ProjectStore, worktrees: WorktreeCatalog, hosts: HostRegistry) {
    this.projects = projects
    this.worktrees = worktrees
    this.hosts = hosts
  }

  async files(input: {
    projectId: string
    query: string
    worktreeId?: string
  }): Promise<{ matches: RuntimeProjectSearchMatch[]; truncated: boolean }> {
    const project = this.projects.get(input.projectId)
    const worktree = input.worktreeId
      ? await this.worktrees.resolve(input.worktreeId)
      : (await this.worktrees.list(project.id, 500)).worktrees.find(
          (candidate) => candidate.isMainWorktree
        )
    if (!worktree || worktree.repoId !== project.id) {
      throw new Error('search_worktree_project_mismatch')
    }
    const host = this.hosts.get(project.executionHostId)
    const matches =
      project.kind === 'git'
        ? await searchGit(host, worktree.path, input.query, project.id, worktree.id)
        : await searchFolder(host, worktree.path, input.query, project.id, worktree.id)
    return {
      matches: matches.slice(0, SEARCH_RESULT_LIMIT),
      truncated: matches.length > SEARCH_RESULT_LIMIT
    }
  }
}

async function searchGit(
  host: Host,
  cwd: string,
  query: string,
  projectId: string,
  worktreeId: string
): Promise<RuntimeProjectSearchMatch[]> {
  const result = await host.exec({
    args: ['-C', cwd, 'grep', '--untracked', '-n', '--null', '-I', '-F', '-e', query, '--'],
    command: 'git',
    timeoutMs: 15_000
  })
  if (result.exitCode === 1) {
    return []
  }
  if (result.exitCode !== 0) {
    throw new Error('search_git_grep_failed')
  }
  return parseGitGrep(result.stdout, projectId, worktreeId)
}

async function searchFolder(
  host: Host,
  cwd: string,
  query: string,
  projectId: string,
  worktreeId: string
): Promise<RuntimeProjectSearchMatch[]> {
  if (!(await host.which('rg'))) {
    throw new Error('search_ripgrep_unavailable')
  }
  const result = await host.exec({
    args: ['--json', '--fixed-strings', '--line-number', '--max-count', '20', '--', query, '.'],
    command: 'rg',
    cwd,
    timeoutMs: 15_000
  })
  if (result.exitCode === 1) {
    return []
  }
  if (result.exitCode !== 0) {
    throw new Error('search_ripgrep_failed')
  }
  return parseRipgrep(result.stdout, projectId, worktreeId)
}

function parseGitGrep(
  output: string,
  projectId: string,
  worktreeId: string
): RuntimeProjectSearchMatch[] {
  const matches: RuntimeProjectSearchMatch[] = []
  let cursor = 0
  while (cursor < output.length && matches.length <= SEARCH_RESULT_LIMIT) {
    const pathEnd = output.indexOf('\0', cursor)
    const lineEnd = pathEnd === -1 ? -1 : output.indexOf('\0', pathEnd + 1)
    const recordEnd = lineEnd === -1 ? -1 : output.indexOf('\n', lineEnd + 1)
    if (pathEnd === -1 || lineEnd === -1) {
      break
    }
    const line = Number(output.slice(pathEnd + 1, lineEnd))
    const end = recordEnd === -1 ? output.length : recordEnd
    if (Number.isSafeInteger(line) && line > 0) {
      matches.push({
        line,
        path: output.slice(cursor, pathEnd),
        preview: output.slice(lineEnd + 1, end).slice(0, 1_000),
        projectId,
        worktreeId
      })
    }
    cursor = end + 1
  }
  return matches
}

function parseRipgrep(
  output: string,
  projectId: string,
  worktreeId: string
): RuntimeProjectSearchMatch[] {
  return output.split('\n').flatMap((line) => {
    if (!line) {
      return []
    }
    const message: unknown = JSON.parse(line)
    if (
      typeof message !== 'object' ||
      message === null ||
      Reflect.get(message, 'type') !== 'match'
    ) {
      return []
    }
    const data = Reflect.get(message, 'data')
    const path = typeof data === 'object' && data !== null ? Reflect.get(data, 'path') : null
    const lines = typeof data === 'object' && data !== null ? Reflect.get(data, 'lines') : null
    const lineNumber =
      typeof data === 'object' && data !== null ? Reflect.get(data, 'line_number') : null
    const pathText = typeof path === 'object' && path !== null ? Reflect.get(path, 'text') : null
    const preview = typeof lines === 'object' && lines !== null ? Reflect.get(lines, 'text') : null
    return typeof pathText === 'string' &&
      typeof preview === 'string' &&
      typeof lineNumber === 'number'
      ? [
          {
            line: lineNumber,
            path: pathText,
            preview: preview.trim().slice(0, 1_000),
            projectId,
            worktreeId
          }
        ]
      : []
  })
}
