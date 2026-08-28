import type { AnyRouter } from '@orpc/server'

import type { ArtifactStore } from '../artifacts/store'
import type { BrowserReplayStore } from '../browser-replay/store'
import type { BrowserWritebackService } from '../browser-writeback/service'
import { ingestConsoleEvents } from '../console-sensor/ingest'
import type { WorkspaceEventLog } from '../events/log'
import type { WorktreeArchiveService } from '../git/repo/archive'
import type { WorktreeCatalog } from '../git/worktree/worktrees'
import type { GitHubCommentDrafter } from '../github-comment/draft'
import type { HostRegistry } from '../hosts/registry'
import type { LayoutService } from '../layouts/service'
import type { MobileDeviceStore } from '../mobile/devices'
import type { MobilePairing } from '../mobile/pairing'
import type { MobileNotificationChannel } from '../notifications/channel'
import type { WorkspacePortService } from '../ports/service'
import { browseHostDirectory, discoverProjectPaths } from '../projects/discovery'
import type { ProjectStore } from '../projects/store'
import type { RitualService } from '../rituals/service'
import type { SearchService } from '../search/service'
import type { DangerousApprovalService } from '../security/dangerous-approval'
import type { AgentSessionService } from '../sessions/service'
import type { SkillCatalogService } from '../skills/catalog'
import type { DaemonUpdateService } from '../updates/service'
import type { VisualRegressionService } from '../visual-regression/service'
import type { WorkbenchRuntimeBridge } from '../workbench/runtime'
import { createAgentSessionRouter } from './agent-router'
import { BrowserFileDownloadService } from './browser-command/file-download'
import { createBrowserCommandRouter, type BrowserCommandDelegate } from './browser-command/router'
import { createBrowserReplayRouter } from './browser-replay-router'
import { createBrowserWritebackRouter } from './browser-writeback-router'
import { daemonImplementation } from './contract'
import { createDangerousApprovalRouter } from './dangerous-approval-router'
import { createHostRouter } from './host-router'
import { createLayoutRouter } from './layout-router'
import { createMobileRouter } from './mobile-router'
import { createNotificationRouter } from './notification-router'
import { withRevisionConflict } from './revision-conflict'
import { createSearchRouter, createSkillCatalogRouter } from './search-router'
import { createWorktreeRouter } from './worktree-router'

export type DaemonRouterServices = {
  agentSessions: AgentSessionService
  artifacts: ArtifactStore
  browserReplays: BrowserReplayStore
  browserCommands: BrowserCommandDelegate
  browserWriteback: BrowserWritebackService
  dangerousApproval: DangerousApprovalService
  events: WorkspaceEventLog
  githubCommentDrafter: GitHubCommentDrafter
  hosts: HostRegistry
  layouts: LayoutService
  mobileDevices: MobileDeviceStore
  mobilePairing: MobilePairing
  mobileNotifications: MobileNotificationChannel
  projects: ProjectStore
  rituals: RitualService
  search: SearchService
  skills: SkillCatalogService
  updates: DaemonUpdateService
  visualRegression: VisualRegressionService
  workbenchRuntime: WorkbenchRuntimeBridge
  worktrees: WorktreeCatalog
  worktreeArchives: WorktreeArchiveService
  workspacePorts: WorkspacePortService
}

export function createDaemonRouter(services: DaemonRouterServices): AnyRouter {
  return daemonImplementation.router({
    agentSession: createAgentSessionRouter(services.agentSessions),
    artifact: {
      abort: daemonImplementation.artifact.abort.handler(({ input }) => ({
        removed: services.artifacts.abort(input.id)
      })),
      append: daemonImplementation.artifact.append.handler(({ input }) => ({
        artifact: services.artifacts.append(input)
      })),
      begin: daemonImplementation.artifact.begin.handler(({ input }) => ({
        artifact: services.artifacts.begin(input)
      })),
      complete: daemonImplementation.artifact.complete.handler(({ input }) => ({
        artifact: services.artifacts.complete(input.id)
      })),
      downloadTicket: daemonImplementation.artifact.downloadTicket.handler(({ input }) =>
        services.artifacts.issueDownloadTicket(input.id)
      ),
      list: daemonImplementation.artifact.list.handler(({ input }) => ({
        artifacts: services.artifacts.list(input.projectId, input.limit)
      })),
      read: daemonImplementation.artifact.read.handler(({ input }) =>
        services.artifacts.read(input)
      )
    },
    browser: createBrowserCommandRouter(
      services.browserCommands,
      new BrowserFileDownloadService(services.browserCommands, services.worktrees)
    ),
    browserCommand: {
      open: daemonImplementation.browserCommand.open.handler(({ input }) => ({
        event: services.events.append('daemon', 'browser.open-tab.requested', input)
      }))
    },
    browserReplay: createBrowserReplayRouter(services.browserReplays, services.events),
    browserWriteback: createBrowserWritebackRouter(services.browserWriteback, services.events),
    dangerousApproval: createDangerousApprovalRouter(services.dangerousApproval),
    githubCommentDraft: {
      create: daemonImplementation.githubCommentDraft.create.handler(async ({ input }) => {
        const result = await services.githubCommentDrafter.create(input)
        services.events.append(input.projectId, 'github.comment-draft.created', {
          kind: input.kind,
          number: input.number,
          pageUrl: input.pageUrl
        })
        return result
      })
    },
    host: createHostRouter(services.hosts, services.projects),
    layout: createLayoutRouter(services.layouts),
    mobile: createMobileRouter(services.mobilePairing),
    notifications: createNotificationRouter(services.mobileNotifications, services.mobileDevices),
    projectContext: {
      resolve: daemonImplementation.projectContext.resolve.handler(async ({ input }) => ({
        matches: (await services.projects.resolveByRemote(input.canonicalKey)).map((project) => ({
          displayName: project.displayName,
          path: project.path,
          projectId: project.id
        }))
      }))
    },
    repo: {
      add: daemonImplementation.repo.add.handler(({ input }) =>
        withRevisionConflict(() =>
          services.events.runAtRevision('project-catalog', input.expectedRevision, async () => {
            const repo = await services.projects.add(input.path, input.kind, input.hostId)
            const event = services.events.append('project-catalog', 'project.added', {
              hostId: repo.executionHostId ?? 'local',
              projectId: repo.id
            })
            return { repo, revision: event.revision }
          })
        )
      ),
      browse: daemonImplementation.repo.browse.handler(({ input }) =>
        browseHostDirectory(services.hosts.get(input.hostId), input.path)
      ),
      discover: daemonImplementation.repo.discover.handler(async ({ input }) => ({
        paths: await discoverProjectPaths(
          services.hosts.get(input.hostId),
          services.projects
            .list()
            .filter((project) => (project.executionHostId ?? 'local') === (input.hostId ?? 'local'))
            .map((project) => project.path),
          input.query
        )
      })),
      list: daemonImplementation.repo.list.handler(() => ({
        repos: services.projects.list(),
        revision: services.events.revision('project-catalog')
      }))
    },
    ritual: {
      getSchedule: daemonImplementation.ritual.getSchedule.handler(() =>
        services.rituals.getSchedule()
      ),
      run: daemonImplementation.ritual.run.handler(({ input }) => services.rituals.run(input.kind)),
      setSchedule: daemonImplementation.ritual.setSchedule.handler(({ input }) => {
        if (input.archiveOnEndDay) {
          services.dangerousApproval.consume('ritual.enable-archive')
        }
        return services.rituals.setSchedule(input)
      })
    },
    search: createSearchRouter(services.search),
    skillCatalog: createSkillCatalogRouter(services.skills),
    terminal: {
      approve: daemonImplementation.terminal.approve.handler(async ({ input }) => {
        services.dangerousApproval.consume(`terminal.approve:${input.terminal}`)
        return {
          accepted: await services.workbenchRuntime.approveWorkbenchTerminal(input.terminal)
        }
      })
    },
    update: {
      check: daemonImplementation.update.check.handler(({ input }) =>
        services.updates.check(input.force)
      )
    },
    visualRegression: {
      latest: daemonImplementation.visualRegression.latest.handler(async ({ input }) => ({
        capture: await services.visualRegression.latest(input)
      })),
      save: daemonImplementation.visualRegression.save.handler(async ({ input }) => {
        const capture = await services.visualRegression.save(input)
        services.events.append(input.projectId, 'browser.visual-capture.saved', {
          diffRatio: input.diffRatio,
          pageUrl: input.pageUrl,
          worktreeId: input.worktreeId
        })
        return { capture }
      })
    },
    worktree: createWorktreeRouter({
      archives: services.worktreeArchives
    }),
    workspacePorts: {
      scan: daemonImplementation.workspacePorts.scan.handler(({ input }) =>
        services.workspacePorts.scan(input)
      )
    },
    workspaceEvents: {
      appendConsole: daemonImplementation.workspaceEvents.appendConsole.handler(async ({ input }) =>
        ingestConsoleEvents(
          {
            events: services.events,
            workbenchRuntime: services.workbenchRuntime,
            workspacePorts: services.workspacePorts
          },
          input
        )
      ),
      appendPerformance: daemonImplementation.workspaceEvents.appendPerformance.handler(
        ({ input }) => {
          const artifact = services.artifacts.readyFile(input.artifactId)
          if (!artifact || artifact.projectId !== input.projectId) {
            throw new Error('performance_artifact_project_mismatch')
          }
          return {
            event: services.events.append(input.projectId, 'browser.performance-audit.saved', {
              artifactId: input.artifactId,
              metricCount: Object.keys(input.metrics).length,
              pageUrl: input.pageUrl,
              worktreeId: input.worktreeId
            })
          }
        }
      ),
      list: daemonImplementation.workspaceEvents.list.handler(({ input }) => ({
        events: services.events.list(input.scope, input.afterId, input.limit),
        latestId: services.events.latestId(input.scope),
        revision: services.events.revision(input.scope)
      })),
      subscribe: daemonImplementation.workspaceEvents.subscribe.handler(async function* ({
        input,
        signal
      }) {
        yield { revision: services.events.revision(input.scope), type: 'ready' as const }
        for await (const event of services.events.subscribe(input.scope, input.afterId, signal)) {
          yield { event, type: 'event' as const }
        }
      })
    }
  })
}
