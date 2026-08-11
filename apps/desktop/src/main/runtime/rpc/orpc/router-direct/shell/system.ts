import type { ShellServicesNotificationsDisplayInput } from '@yiru/runtime-protocol/contract'
import { BrowserWindow } from 'electron'
import { getShellGitHubService } from '~main/github/github'
import { getShellNotificationsService } from '~main/notifications/notifications'
import { getShellRepoHostService } from '~main/project-groups/repos'
import { getShellAppService } from '~main/shell/app'
import { reloadShellApp } from '~main/shell/app-reload'
import { getShellAppStartupService } from '~main/shell/app-startup'
import { requireShellRenderer } from '~main/shell/files'
import { getShellRuntimeStateService } from '~main/shell/runtime-state'
import { getShellUpdaterService } from '~main/shell/updater'
import { getShellStarNagService } from '~main/star-nag/shell-service'
import type { RuntimeSyncWindowGraph } from '~shared/runtime-types'
import type {
  FloatingTerminalCwdRequest,
  GitHubPRRefreshCandidate,
  GitHubPRRefreshReason,
  UpdateCheckOptions
} from '~shared/types'

import { runtimeImplementation } from '../../access-middleware'

export const shellSystemRuntimeHandlers = {
  app: {
    getIdentity: runtimeImplementation.shell.app.getIdentity.handler(() =>
      getShellAppService().getIdentity()
    ),
    relaunch: runtimeImplementation.shell.app.relaunch.handler(() =>
      getShellAppService().relaunch()
    ),
    restart: runtimeImplementation.shell.app.restart.handler(() => getShellAppService().restart()),
    reload: runtimeImplementation.shell.app.reload.handler(({ context }) =>
      reloadShellApp(requireShellRenderer(context.renderingWebContentsId).id)
    ),
    awaitFirstWindowStartupServices:
      runtimeImplementation.shell.app.awaitFirstWindowStartupServices.handler(() =>
        getShellAppStartupService().awaitFirstWindowStartupServices()
      ),
    startupDiagnostic: runtimeImplementation.shell.app.startupDiagnostic.handler(({ input }) =>
      getShellAppStartupService().startupDiagnostic(input.event, input.details)
    ),
    getKeyboardInputSourceId: runtimeImplementation.shell.app.getKeyboardInputSourceId.handler(() =>
      getShellAppService().getKeyboardInputSourceId()
    ),
    setUnreadDockBadgeCount: runtimeImplementation.shell.app.setUnreadDockBadgeCount.handler(
      ({ input }) => getShellAppService().setUnreadDockBadgeCount(input.count)
    ),
    getFloatingTerminalCwd: runtimeImplementation.shell.app.getFloatingTerminalCwd.handler(
      ({ input }) =>
        getShellAppService().getFloatingTerminalCwd(
          shellOptionalDocument<FloatingTerminalCwdRequest>(input, 'invalid_floating_terminal_cwd')
        )
    ),
    getFloatingMarkdownDirectory:
      runtimeImplementation.shell.app.getFloatingMarkdownDirectory.handler(() =>
        getShellAppService().getFloatingMarkdownDirectory()
      ),
    pickFloatingMarkdownDocument:
      runtimeImplementation.shell.app.pickFloatingMarkdownDocument.handler(({ context }) =>
        getShellAppService().pickFloatingMarkdownDocument(
          shellWindow(context.renderingWebContentsId)
        )
      ),
    pickFloatingWorkspaceDirectory:
      runtimeImplementation.shell.app.pickFloatingWorkspaceDirectory.handler(({ context }) =>
        getShellAppService().pickFloatingWorkspaceDirectory(
          shellWindow(context.renderingWebContentsId)
        )
      )
  },
  repoHost: {
    pickFolder: runtimeImplementation.shell.repoHost.pickFolder.handler(() =>
      getShellRepoHostService().pickFolder()
    ),
    pickFolders: runtimeImplementation.shell.repoHost.pickFolders.handler(() =>
      getShellRepoHostService().pickFolders()
    ),
    pickDirectory: runtimeImplementation.shell.repoHost.pickDirectory.handler(() =>
      getShellRepoHostService().pickDirectory()
    ),
    removeForHost: runtimeImplementation.shell.repoHost.removeForHost.handler(({ input }) =>
      getShellRepoHostService().removeForHost(input)
    ),
    reorderForHost: runtimeImplementation.shell.repoHost.reorderForHost.handler(({ input }) =>
      getShellRepoHostService().reorderForHost(input)
    ),
    cloneAbort: runtimeImplementation.shell.repoHost.cloneAbort.handler(() =>
      getShellRepoHostService().cloneAbort()
    ),
    getDefaultCreateProjectParent:
      runtimeImplementation.shell.repoHost.getDefaultCreateProjectParent.handler(() =>
        getShellRepoHostService().getDefaultCreateProjectParent()
      )
  },
  runtime: {
    syncWindowGraph: runtimeImplementation.shell.runtime.syncWindowGraph.handler(
      ({ input, context }) => {
        const renderer = requireShellRenderer(context.renderingWebContentsId)
        const window = BrowserWindow.fromWebContents(renderer)
        if (!window) {
          throw new Error('unavailable_on_host: shell runtime graph requires an Electron window')
        }
        return getShellRuntimeStateService().syncWindowGraph(
          window.id,
          shellDocument<RuntimeSyncWindowGraph>(input, 'invalid_runtime_window_graph')
        )
      }
    ),
    getTerminalFitOverrides: runtimeImplementation.shell.runtime.getTerminalFitOverrides.handler(
      () => getShellRuntimeStateService().getTerminalFitOverrides()
    ),
    getTerminalDrivers: runtimeImplementation.shell.runtime.getTerminalDrivers.handler(() =>
      getShellRuntimeStateService().getTerminalDrivers()
    ),
    getBrowserDrivers: runtimeImplementation.shell.runtime.getBrowserDrivers.handler(() =>
      getShellRuntimeStateService().getBrowserDrivers()
    ),
    restoreTerminalFit: runtimeImplementation.shell.runtime.restoreTerminalFit.handler(
      ({ input }) => getShellRuntimeStateService().restoreTerminalFit(input.ptyId)
    ),
    reclaimBrowserForDesktop: runtimeImplementation.shell.runtime.reclaimBrowserForDesktop.handler(
      ({ input }) => getShellRuntimeStateService().reclaimBrowserForDesktop(input.browserPageId)
    )
  },
  gh: {
    viewer: runtimeImplementation.shell.gh.viewer.handler(() => getShellGitHubService().viewer()),
    enqueuePRRefresh: runtimeImplementation.shell.gh.enqueuePRRefresh.handler(
      ({ input, context }) =>
        getShellGitHubService().enqueuePRRefresh(
          requireShellRenderer(context.renderingWebContentsId).id,
          shellDocument<{
            candidate: GitHubPRRefreshCandidate
            reason: GitHubPRRefreshReason
            priority?: number
          }>(input, 'invalid_github_pr_refresh')
        )
    ),
    reportVisiblePRRefreshCandidates:
      runtimeImplementation.shell.gh.reportVisiblePRRefreshCandidates.handler(
        ({ input, context }) =>
          getShellGitHubService().reportVisiblePRRefreshCandidates(
            requireShellRenderer(context.renderingWebContentsId).id,
            shellDocument<{ candidates: GitHubPRRefreshCandidate[]; generation: number }>(
              input,
              'invalid_github_visible_prs'
            )
          )
      ),
    checkYiruStarred: runtimeImplementation.shell.gh.checkYiruStarred.handler(() =>
      getShellGitHubService().checkYiruStarred()
    ),
    starYiru: runtimeImplementation.shell.gh.starYiru.handler(({ input }) =>
      getShellGitHubService().starYiru(input)
    )
  },
  notifications: {
    displayNative: runtimeImplementation.shell.notifications.displayNative.handler(({ input }) =>
      getShellNotificationsService().displayNative(
        shellDocument<ShellServicesNotificationsDisplayInput>(input, 'invalid_notification')
      )
    ),
    dismissNative: runtimeImplementation.shell.notifications.dismissNative.handler(({ input }) =>
      getShellNotificationsService().dismissNative(input.notificationIds)
    ),
    openSystemSettings: runtimeImplementation.shell.notifications.openSystemSettings.handler(() =>
      getShellNotificationsService().openSystemSettings()
    ),
    getPermissionStatus: runtimeImplementation.shell.notifications.getPermissionStatus.handler(() =>
      getShellNotificationsService().getPermissionStatus()
    ),
    probeDelivery: runtimeImplementation.shell.notifications.probeDelivery.handler(({ input }) =>
      getShellNotificationsService().probeDelivery(
        shellOptionalDocument<{ force?: boolean }>(input, 'invalid_notification_probe')
      )
    ),
    playSound: runtimeImplementation.shell.notifications.playSound.handler(() =>
      getShellNotificationsService().loadSound()
    )
  },
  starNag: {
    dismiss: runtimeImplementation.shell.starNag.dismiss.handler(() =>
      getShellStarNagService().dismiss()
    ),
    later: runtimeImplementation.shell.starNag.later.handler(() =>
      getShellStarNagService().later()
    ),
    complete: runtimeImplementation.shell.starNag.complete.handler(() =>
      getShellStarNagService().complete()
    ),
    disable: runtimeImplementation.shell.starNag.disable.handler(() =>
      getShellStarNagService().disable()
    ),
    openWeb: runtimeImplementation.shell.starNag.openWeb.handler(() =>
      getShellStarNagService().openWeb()
    ),
    starYiru: runtimeImplementation.shell.starNag.starYiru.handler(() =>
      getShellStarNagService().starYiru()
    ),
    forceShow: runtimeImplementation.shell.starNag.forceShow.handler(() =>
      getShellStarNagService().forceShow()
    ),
    agentValueMoment: runtimeImplementation.shell.starNag.agentValueMoment.handler(() =>
      getShellStarNagService().agentValueMoment()
    ),
    showAgentValueMoment: runtimeImplementation.shell.starNag.showAgentValueMoment.handler(() =>
      getShellStarNagService().showAgentValueMoment()
    ),
    onboardingCompleted: runtimeImplementation.shell.starNag.onboardingCompleted.handler(() =>
      getShellStarNagService().onboardingCompleted()
    )
  },
  updater: {
    getVersion: runtimeImplementation.shell.updater.getVersion.handler(() =>
      getShellUpdaterService().getVersion()
    ),
    getStatus: runtimeImplementation.shell.updater.getStatus.handler(() =>
      getShellUpdaterService().getStatus()
    ),
    check: runtimeImplementation.shell.updater.check.handler(({ input }) =>
      getShellUpdaterService().check(
        shellOptionalDocument<UpdateCheckOptions>(input, 'invalid_update_options')
      )
    ),
    download: runtimeImplementation.shell.updater.download.handler(() =>
      getShellUpdaterService().download()
    ),
    quitAndInstall: runtimeImplementation.shell.updater.quitAndInstall.handler(() =>
      getShellUpdaterService().quitAndInstall()
    ),
    dismissNudge: runtimeImplementation.shell.updater.dismissNudge.handler(() =>
      getShellUpdaterService().dismissNudge()
    )
  }
} as const

function shellWindow(webContentsId: number | undefined): BrowserWindow | null {
  return BrowserWindow.fromWebContents(requireShellRenderer(webContentsId))
}

function shellOptionalDocument<T>(value: unknown, code: string): T | undefined {
  return value === undefined ? undefined : shellDocument<T>(value, code)
}

function shellDocument<T>(value: unknown, code: string): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(code)
  }
  // Why: runtime-protocol cannot import desktop-only shared document types;
  // the fixed-local boundary validates the container before restoring them.
  return value as T
}
