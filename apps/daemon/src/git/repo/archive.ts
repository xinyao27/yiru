import type {
  RuntimeWorktreeArchive,
  WorktreeArchiveInput,
  WorktreeArchiveRestoreInput
} from '@yiru/runtime-protocol/contract'
import { parse } from 'yaml'

import type { WorkspaceEventLog } from '../../events/log'
import type { Host } from '../../hosts/contract'
import type { HostRegistry } from '../../hosts/registry'
import type { ProjectStore } from '../../projects/store'
import type { WorkbenchRuntimeBridge } from '../../workbench/runtime'
import { runGit } from '../runner/command'
import type { WorktreeCatalog } from '../worktree/worktrees'
import type { WorktreeArchiveStore } from './archive-store'

const ARCHIVE_HOOK_TIMEOUT_MS = 10 * 60 * 1_000

export class WorktreeArchiveService {
  private readonly events: WorkspaceEventLog
  private readonly hosts: HostRegistry
  private readonly projects: ProjectStore
  private readonly store: WorktreeArchiveStore
  private readonly runtime: WorkbenchRuntimeBridge
  private readonly worktrees: WorktreeCatalog

  constructor(input: {
    events: WorkspaceEventLog
    hosts: HostRegistry
    projects: ProjectStore
    store: WorktreeArchiveStore
    runtime: WorkbenchRuntimeBridge
    worktrees: WorktreeCatalog
  }) {
    this.events = input.events
    this.hosts = input.hosts
    this.projects = input.projects
    this.store = input.store
    this.runtime = input.runtime
    this.worktrees = input.worktrees
  }

  list(repo?: string): RuntimeWorktreeArchive[] {
    return this.store.list(repo ? this.projects.get(repo).id : undefined)
  }

  async archive(input: WorktreeArchiveInput): Promise<{
    archive: RuntimeWorktreeArchive
    revision: number
  }> {
    const worktree = await this.worktrees.resolve(input.worktree)
    return this.events.runAtRevision(worktree.repoId, input.expectedRevision, async () => {
      if (worktree.isMainWorktree || worktree.isBare) {
        throw new Error('worktree_archive_main_forbidden')
      }
      return this.archiveWorktree(worktree, input.deleteBranch === true)
    })
  }

  private async archiveWorktree(
    worktree: Awaited<ReturnType<WorktreeCatalog['resolve']>>,
    deleteBranch: boolean
  ): Promise<{ archive: RuntimeWorktreeArchive; revision: number }> {
    const archive = this.store.begin({
      branch: worktree.branch,
      head: worktree.head,
      originalWorktreeId: worktree.id,
      path: worktree.path,
      repoId: worktree.repoId
    })
    this.events.append(worktree.repoId, 'worktree.archive.started', {
      archiveId: archive.id,
      worktreeId: worktree.id
    })
    let stashOid: string | null = null
    const host = this.hosts.get(worktree.hostId)
    try {
      await this.closeWorktreeTerminals(worktree.id)
      await runArchiveHook(worktree.path, host)
      const project = this.projects.get(worktree.repoId)
      stashOid = await stashChanges(worktree.path, archive.id, host)
      this.store.preserve(archive.id, stashOid)
      await runGit(project.path, ['worktree', 'remove', '--force', worktree.path], undefined, host)
      if (deleteBranch && worktree.branch && worktree.branch !== '(detached)') {
        await runGit(project.path, ['branch', '-D', worktree.branch], undefined, host)
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      const failed = this.store.fail(archive.id, detail)
      this.events.append(worktree.repoId, 'worktree.archive.failed', {
        archiveId: archive.id,
        detail,
        worktreeId: worktree.id
      })
      if (stashOid && (await host.fileExists(worktree.path))) {
        await restoreStashAfterFailedRemoval(worktree.path, stashOid, host)
      }
      throw new WorktreeArchiveFailure(failed, error)
    }
    const completed = this.store.complete(archive.id, stashOid)
    const event = this.events.append(worktree.repoId, 'worktree.archive.complete', {
      archiveId: archive.id,
      branchDeleted: deleteBranch,
      changesPreserved: stashOid !== null,
      worktreeId: worktree.id
    })
    return { archive: completed, revision: event.revision }
  }

  async restore(input: WorktreeArchiveRestoreInput): Promise<{
    archive: RuntimeWorktreeArchive
    revision: number
  }> {
    const archive = this.store.get(input.archiveId)
    return this.events.runAtRevision(archive.repoId, input.expectedRevision, async () => {
      if (archive.status !== 'archived' && archive.status !== 'failed') {
        throw new Error('worktree_archive_not_restorable')
      }
      const project = this.projects.get(archive.repoId)
      const host = this.hosts.get(project.executionHostId)
      if (await host.fileExists(archive.path)) {
        throw new Error('worktree_archive_path_occupied')
      }
      const isDetached = archive.branch === '(detached)'
      const branchExists = !isDetached && (await hasBranch(project.path, archive.branch, host))
      await runGit(
        project.path,
        isDetached
          ? ['worktree', 'add', '--detach', archive.path, archive.head]
          : branchExists
            ? ['worktree', 'add', archive.path, archive.branch]
            : ['worktree', 'add', '-b', archive.branch, archive.path, archive.head],
        undefined,
        host
      )
      if (archive.stashOid) {
        await runGit(archive.path, ['stash', 'apply', '--index', archive.stashOid], undefined, host)
      }
      const restored = this.store.restored(archive.id)
      const event = this.events.append(archive.repoId, 'worktree.archive.restored', {
        archiveId: archive.id,
        worktreeId: archive.originalWorktreeId
      })
      return { archive: restored, revision: event.revision }
    })
  }

  private async closeWorktreeTerminals(worktreeId: string): Promise<void> {
    await this.runtime.closeWorkbenchTerminals(worktreeId)
  }
}

class WorktreeArchiveFailure extends Error {
  readonly archive: RuntimeWorktreeArchive

  constructor(archive: RuntimeWorktreeArchive, cause: unknown) {
    super('worktree_archive_failed', { cause })
    this.name = 'WorktreeArchiveFailure'
    this.archive = archive
  }
}

async function stashChanges(
  worktreePath: string,
  archiveId: string,
  host: Host
): Promise<string | null> {
  const status = (
    await runGit(worktreePath, ['status', '--porcelain'], undefined, host)
  ).stdout.trim()
  if (!status) {
    return null
  }
  await runGit(
    worktreePath,
    ['stash', 'push', '--include-untracked', '--message', `yiru-archive:${archiveId}`],
    undefined,
    host
  )
  return (await runGit(worktreePath, ['rev-parse', 'refs/stash'], undefined, host)).stdout.trim()
}

async function hasBranch(projectPath: string, branch: string, host: Host): Promise<boolean> {
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

async function restoreStashAfterFailedRemoval(
  worktreePath: string,
  stashOid: string,
  host: Host
): Promise<void> {
  try {
    await runGit(worktreePath, ['stash', 'apply', '--index', stashOid], undefined, host)
  } catch {
    // Why: the archive record retains the exact stash OID when an automatic reapply conflicts.
  }
}

async function runArchiveHook(worktreePath: string, host: Host): Promise<void> {
  const text = await host.readText(host.join(worktreePath, 'yiru.yaml'), 1024 * 1024)
  if (text === null) {
    return
  }
  const value: unknown = parse(text)
  const scripts = typeof value === 'object' && value !== null ? Reflect.get(value, 'scripts') : null
  const archive =
    typeof scripts === 'object' && scripts !== null ? Reflect.get(scripts, 'archive') : null
  if (typeof archive !== 'string' || !archive.trim()) {
    return
  }
  const result = await host.exec({
    args: ['-lc', archive.trim()],
    command: 'sh',
    cwd: worktreePath,
    timeoutMs: ARCHIVE_HOOK_TIMEOUT_MS
  })
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || 'worktree_archive_hook_failed')
  }
}
