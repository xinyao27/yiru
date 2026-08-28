import type {
  RuntimeRepo,
  WorktreeCreateInput,
  RuntimeWorktreeListResult,
  RuntimeWorktreeRecord
} from '@yiru/runtime-protocol/contract'

import type { Host } from '../../hosts/contract'
import type { HostRegistry } from '../../hosts/registry'
import type { ProjectStore } from '../../projects/store'
import { runGit } from '../runner/command'
import { prepareWorktree, type WorktreePreparationProgress } from './worktree-preparation'

type GitWorktreeFields = {
  bare: boolean
  branch: string
  head: string
  lockedReason: string | null
  path: string
  prunableReason: string | null
}

type GitWorktreeInfo = {
  branch: string
  head: string
  isBare: boolean
  isMainWorktree: boolean
  lockReason?: string
  locked?: boolean
  path: string
  prunable?: boolean
  prunableReason?: string
}

export class WorktreeCatalog {
  private readonly projects: ProjectStore
  private readonly hosts: HostRegistry

  constructor(projects: ProjectStore, hosts: HostRegistry) {
    this.projects = projects
    this.hosts = hosts
  }

  async list(repoSelector?: string, limit = 500): Promise<RuntimeWorktreeListResult> {
    const projects = repoSelector ? [this.projects.get(repoSelector)] : this.projects.list()
    const worktrees = (
      await Promise.all(projects.map((project) => this.listProject(project)))
    ).flat()
    const pageSize = Math.max(1, Math.min(Math.floor(limit), 500))
    return {
      totalCount: worktrees.length,
      truncated: worktrees.length > pageSize,
      worktrees: worktrees.slice(0, pageSize)
    }
  }

  async resolve(selector: string): Promise<RuntimeWorktreeRecord> {
    const normalized = selector.startsWith('id:') ? selector.slice(3) : selector
    const matches = (await this.list(undefined, 500)).worktrees.filter(
      (worktree) =>
        worktree.id === normalized ||
        worktree.path === normalized ||
        worktree.displayName === normalized ||
        worktree.branch === normalized
    )
    if (matches.length !== 1) {
      throw new Error(matches.length === 0 ? 'worktree_not_found' : 'worktree_selector_ambiguous')
    }
    return matches[0]
  }

  projectId(selector: string): string {
    return this.projects.get(selector).id
  }

  async create(
    input: WorktreeCreateInput,
    report: (progress: WorktreePreparationProgress) => void = () => {}
  ): Promise<RuntimeWorktreeRecord> {
    const project = this.projects.get(input.repo)
    const host = this.hosts.get(project.executionHostId)
    if (project.kind === 'folder') {
      throw new Error('git_worktree_requires_git_project')
    }
    const name = input.name?.trim()
    if (!name) {
      throw new Error('worktree_name_required')
    }
    const directoryName = name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
    if (!directoryName) {
      throw new Error('worktree_name_invalid')
    }
    const branch = input.branchNameOverride?.trim() || name
    await runGit(project.path, ['check-ref-format', '--branch', branch], undefined, host)
    const destination = host.join(
      host.dirname(project.path),
      `${host.basename(project.path)}-${directoryName}`
    )
    const branchExists = await doesBranchExist(project.path, branch, host)
    await runGit(
      project.path,
      branchExists
        ? ['worktree', 'add', destination, branch]
        : ['worktree', 'add', '-b', branch, destination, input.baseBranch ?? 'HEAD'],
      undefined,
      host
    )
    report({ kind: 'git-complete' })
    await prepareWorktree(
      project.path,
      destination,
      input.setupDecision !== 'skip' && input.runHooks !== false,
      report,
      host
    )
    const created = (await this.list(project.id, 500)).worktrees.find(
      (worktree) => worktree.path === destination
    )
    if (!created) {
      throw new Error('worktree_create_not_observable')
    }
    return {
      ...created,
      createdAt: Date.now(),
      ...(input.createdWithAgent ? { createdWithAgent: input.createdWithAgent } : {}),
      ...(input.displayName ? { displayName: input.displayName } : {}),
      ...(input.comment ? { comment: input.comment } : {})
    }
  }

  private async listProject(project: RuntimeRepo): Promise<RuntimeWorktreeRecord[]> {
    if (project.kind === 'folder') {
      return [createFolderWorktree(project, this.hosts.get(project.executionHostId))]
    }
    const host = this.hosts.get(project.executionHostId)
    const output = (
      await runGit(project.path, ['worktree', 'list', '--porcelain', '-z'], undefined, host)
    ).stdout
    return parseGitWorktrees(output).map((fields, index) =>
      toRuntimeWorktree(project, fields, index === 0, host)
    )
  }
}

async function doesBranchExist(projectPath: string, branch: string, host: Host): Promise<boolean> {
  try {
    await runGit(
      projectPath,
      ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
      undefined,
      host
    )
    return true
  } catch {
    return false
  }
}

function parseGitWorktrees(output: string): GitWorktreeFields[] {
  const records: GitWorktreeFields[] = []
  let current: GitWorktreeFields | null = null
  for (const field of output.split('\0')) {
    if (!field) {
      if (current) {
        records.push(current)
        current = null
      }
      continue
    }
    const separator = field.indexOf(' ')
    const key = separator === -1 ? field : field.slice(0, separator)
    const value = separator === -1 ? '' : field.slice(separator + 1)
    if (key === 'worktree') {
      if (current) {
        records.push(current)
      }
      current = {
        bare: false,
        branch: '',
        head: '',
        lockedReason: null,
        path: value,
        prunableReason: null
      }
      continue
    }
    if (!current) {
      continue
    }
    applyWorktreeField(current, key, value)
  }
  if (current) {
    records.push(current)
  }
  return records
}

function applyWorktreeField(record: GitWorktreeFields, key: string, value: string): void {
  switch (key) {
    case 'HEAD':
      record.head = value
      break
    case 'branch':
      record.branch = value.replace(/^refs\/heads\//, '')
      break
    case 'detached':
      record.branch = '(detached)'
      break
    case 'bare':
      record.bare = true
      break
    case 'locked':
      record.lockedReason = value || 'locked'
      break
    case 'prunable':
      record.prunableReason = value || 'prunable'
      break
  }
}

function toRuntimeWorktree(
  project: RuntimeRepo,
  fields: GitWorktreeFields,
  isMainWorktree: boolean,
  host: Host
): RuntimeWorktreeRecord {
  const git: GitWorktreeInfo = {
    branch: fields.branch,
    head: fields.head,
    isBare: fields.bare,
    isMainWorktree,
    path: fields.path,
    ...(fields.lockedReason ? { lockReason: fields.lockedReason, locked: true } : {}),
    ...(fields.prunableReason ? { prunable: true, prunableReason: fields.prunableReason } : {})
  }
  const id = `${project.id}::${fields.path}`
  return {
    ...git,
    childWorktreeIds: [],
    comment: '',
    displayName: host.basename(fields.path),
    git,
    id,
    isArchived: false,
    isPinned: false,
    isUnread: false,
    hostId: host.id,
    lastActivityAt: project.addedAt,
    lineage: null,
    linkedPR: null,
    parentWorktreeId: null,
    repoId: project.id,
    sortOrder: 0
  }
}

function createFolderWorktree(project: RuntimeRepo, host: Host): RuntimeWorktreeRecord {
  return toRuntimeWorktree(
    project,
    {
      bare: false,
      branch: '',
      head: '',
      lockedReason: null,
      path: project.path,
      prunableReason: null
    },
    true,
    host
  )
}
