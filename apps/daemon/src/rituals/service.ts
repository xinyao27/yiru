import type {
  RitualProjectResult,
  RitualRunResult,
  RitualSchedule,
  RitualScheduleStatus
} from '@yiru/runtime-protocol/contract'
import { parse } from 'yaml'

import type { WorkspaceEventLog } from '../events/log'
import type { WorktreeArchiveService } from '../git/repo/archive'
import { runGit } from '../git/runner/command'
import type { WorktreeCatalog } from '../git/worktree/worktrees'
import type { Host } from '../hosts/contract'
import type { HostRegistry } from '../hosts/registry'
import { translate } from '../i18n/translate'
import type { ProjectStore } from '../projects/store'
import type { WorkbenchRuntimeBridge } from '../workbench/runtime'
import type { RitualScheduleStore } from './store'

export class RitualService {
  private readonly archives: WorktreeArchiveService
  private readonly events: WorkspaceEventLog
  private readonly hosts: HostRegistry
  private readonly projects: ProjectStore
  private readonly schedule: RitualScheduleStore
  private readonly runtime: WorkbenchRuntimeBridge
  private readonly worktrees: WorktreeCatalog

  constructor(
    projects: ProjectStore,
    worktrees: WorktreeCatalog,
    runtime: WorkbenchRuntimeBridge,
    events: WorkspaceEventLog,
    hosts: HostRegistry,
    archives: WorktreeArchiveService,
    schedule: RitualScheduleStore
  ) {
    this.projects = projects
    this.worktrees = worktrees
    this.runtime = runtime
    this.events = events
    this.hosts = hosts
    this.archives = archives
    this.schedule = schedule
  }

  getSchedule(): RitualScheduleStatus {
    return this.schedule.read()
  }

  setSchedule(schedule: RitualSchedule): RitualScheduleStatus {
    const result = this.schedule.update(schedule)
    this.events.append('daemon', 'ritual.schedule.updated', {
      archiveOnEndDay: result.archiveOnEndDay,
      enabled: result.enabled,
      endMinutes: result.endMinutes,
      startMinutes: result.startMinutes,
      timezone: result.timezone
    })
    return result
  }

  async run(kind: RitualRunResult['kind']): Promise<RitualRunResult> {
    const projects = this.projects.list()
    const schedule = this.schedule.read()
    const results = await Promise.all(
      projects.map((project) =>
        kind === 'start-day'
          ? this.startProject(project.id, schedule.lastEndAt)
          : this.summarizeProject(project.id, schedule.archiveOnEndDay)
      )
    )
    const ready = results.filter((result) => result.status === 'ready').length
    const failed = results.length - ready
    this.events.append('daemon', `ritual.${kind}.complete`, {
      failed,
      ready,
      total: results.length
    })
    this.schedule.recordRun(kind, Date.now())
    return {
      kind,
      projects: results,
      summary: translate('{{ready}} ready, {{failed}} need attention', { failed, ready })
    }
  }

  recordScheduleFailure(kind: RitualRunResult['kind'], detail: string): void {
    this.schedule.recordFailure(detail)
    this.events.append('daemon', 'ritual.schedule.failed', { detail, kind })
  }

  private async startProject(
    projectId: string,
    overnightSince: number | null
  ): Promise<RitualProjectResult> {
    const project = this.projects.get(projectId)
    const host = this.hosts.get(project.executionHostId)
    try {
      if (project.kind === 'git') {
        await runGit(project.path, ['fetch', '--all', '--prune'], 2 * 60_000, host)
        await runGit(project.path, ['pull', '--ff-only'], 2 * 60_000, host)
      }
      const main = (await this.worktrees.list(project.id, 500)).worktrees.find(
        (worktree) => worktree.isMainWorktree
      )
      const runCommand = await readRunCommand(project.path, host)
      if (main && runCommand) {
        await this.runtime.launchWorkbenchTerminal(main.id, translate('Dev server'), runCommand)
      }
      this.events.append(project.id, 'ritual.start-day.ready', {
        devServerStarted: Boolean(main && runCommand),
        overnightEvents: overnightSince ? this.events.countSince(project.id, overnightSince) : 0
      })
      const overnightEvents = overnightSince
        ? this.events.countSince(project.id, overnightSince)
        : 0
      if (overnightSince) {
        this.events.append(project.id, 'ritual.overnight.summary', { overnightEvents })
      }
      return {
        detail: translate('{{status}}; {{count}} overnight events', {
          count: overnightEvents,
          status: runCommand ? translate('Updated and dev server started') : translate('Updated')
        }),
        projectId,
        status: 'ready'
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      this.events.append(project.id, 'ritual.start-day.failed', { detail })
      return { detail, projectId, status: 'failed' }
    }
  }

  private async summarizeProject(
    projectId: string,
    archiveOnEndDay: boolean
  ): Promise<RitualProjectResult> {
    const project = this.projects.get(projectId)
    const host = this.hosts.get(project.executionHostId)
    try {
      const changes =
        project.kind === 'git'
          ? (await runGit(project.path, ['status', '--short'], undefined, host)).stdout
          : ''
      const count = changes.split('\n').filter(Boolean).length
      const archivedWorktrees = archiveOnEndDay ? await this.archiveProjectWorktrees(project.id) : 0
      this.events.append(project.id, 'ritual.end-day.summary', {
        archivedWorktrees,
        changedPaths: count
      })
      return {
        detail: translate('{{count}} changed paths; {{archived}} worktrees archived', {
          archived: archivedWorktrees,
          count
        }),
        projectId,
        status: 'ready'
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      return { detail, projectId, status: 'failed' }
    }
  }

  private async archiveProjectWorktrees(projectId: string): Promise<number> {
    const worktrees = (await this.worktrees.list(projectId, 500)).worktrees.filter(
      (worktree) => !worktree.isMainWorktree && !worktree.isBare
    )
    let archived = 0
    for (const worktree of worktrees) {
      await this.archives.archive({
        deleteBranch: false,
        expectedRevision: this.events.revision(projectId),
        worktree: worktree.id
      })
      archived += 1
    }
    return archived
  }
}

async function readRunCommand(projectPath: string, host: Host): Promise<string | null> {
  const text = await host.readText(host.join(projectPath, 'yiru.yaml'), 1024 * 1024)
  if (text === null) {
    return null
  }
  try {
    const value: unknown = parse(text)
    const scripts =
      typeof value === 'object' && value !== null ? Reflect.get(value, 'scripts') : null
    const run = typeof scripts === 'object' && scripts !== null ? Reflect.get(scripts, 'run') : null
    return typeof run === 'string' && run.trim() ? run.trim() : null
  } catch {
    return null
  }
}
