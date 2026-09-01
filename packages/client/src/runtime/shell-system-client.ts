import type { AppStarSource } from '@yiru/runtime-protocol/workbench/gh-star-source'
import type {
  RuntimeSyncWindowGraph,
  RuntimeSyncWindowGraphResult,
  RuntimeTerminalDriverState
} from '@yiru/runtime-protocol/workbench/runtime-types'
import type {
  GitHubPRRefreshCandidate,
  GitHubPRRefreshEnqueueResult,
  GitHubPRRefreshReason,
  GitHubViewer,
  UpdateCheckOptions,
  UpdateStatus
} from '@yiru/runtime-protocol/workbench/types'
import {
  YIRU_APP_RESTART_ABORTED_EVENT,
  YIRU_APP_RESTART_STARTED_EVENT,
  YIRU_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT,
  YIRU_UPDATER_QUIT_AND_INSTALL_STARTED_EVENT
} from '~renderer/updater-renderer-events'

import { callShellOrpc } from './orpc-client'
import { subscribeShellEvent } from './shell-events-client'
import {
  daemonShellNotificationsApi,
  type ShellNotificationsApi
} from './shell-notifications-client'
import { prepareShellRestart } from './shell-restart-client'

export type ShellAppApi = {
  restart: () => Promise<void>
  startupDiagnostic: (event: string, details?: Record<string, unknown>) => Promise<void>
}
export type ShellRepoHostApi = {
  pickFolder: () => Promise<string | null>
  pickFolders: () => Promise<string[]>
  pickDirectory: () => Promise<string | null>
  removeForHost: (args: {
    expectedRevision: number
    repoId: string
    hostId: string
  }) => Promise<{ removed: true; revision: number }>
  reorderForHost: (args: {
    expectedRevision: number
    orderedIds: string[]
    hostId: string
  }) => Promise<{ revision?: number; status: 'applied' | 'rejected' }>
  cloneAbort: () => Promise<void>
  getDefaultCreateProjectParent: () => Promise<string>
}
export type ShellRuntimeStateApi = {
  syncWindowGraph: (graph: RuntimeSyncWindowGraph) => Promise<RuntimeSyncWindowGraphResult>
  getTerminalFitOverrides: () => Promise<
    { ptyId: string; mode: 'mobile-fit' | 'remote-desktop-fit'; cols: number; rows: number }[]
  >
  getTerminalDrivers: () => Promise<{ ptyId: string; driver: RuntimeTerminalDriverState }[]>
  restoreTerminalFit: (ptyId: string) => Promise<{ restored: boolean }>
}
export type ShellGitHubApi = {
  viewer: () => Promise<GitHubViewer | null>
  enqueuePRRefresh: (args: {
    candidate: GitHubPRRefreshCandidate
    reason: GitHubPRRefreshReason
    priority?: number
  }) => Promise<GitHubPRRefreshEnqueueResult | false>
  reportVisiblePRRefreshCandidates: (args: {
    candidates: GitHubPRRefreshCandidate[]
    generation: number
  }) => Promise<boolean>
  checkYiruStarred: () => Promise<boolean | null>
  starYiru: (source: AppStarSource) => Promise<boolean>
}
export type ShellStarNagApi = {
  onShow: (
    callback: (payload?: { mode?: 'gh' | 'web'; surface?: 'card' | 'toast' }) => void
  ) => () => void
  onHide: (callback: () => void) => () => void
  dismiss: () => Promise<void>
  later: () => Promise<void>
  complete: () => Promise<void>
  disable: () => Promise<void>
  openWeb: () => Promise<void>
  starYiru: () => Promise<boolean>
  forceShow: () => Promise<void>
  agentValueMoment: () => Promise<{ status: 'ready'; mode: 'gh' | 'web' } | { status: 'skipped' }>
  showAgentValueMoment: () => Promise<void>
  onboardingCompleted: () => Promise<void>
}
export type ShellUpdaterApi = {
  getVersion: () => Promise<string>
  getStatus: () => Promise<UpdateStatus>
  check: (options?: UpdateCheckOptions) => Promise<void>
  download: () => Promise<void>
  quitAndInstall: () => Promise<void>
  onStatus: (callback: (status: UpdateStatus) => void) => () => void
}

export const shellAppApi: ShellAppApi = {
  restart: async () => {
    await prepareShellRestart({
      startedEventName: YIRU_APP_RESTART_STARTED_EVENT,
      abortedEventName: YIRU_APP_RESTART_ABORTED_EVENT
    })
    try {
      await callShellOrpc((client) => client.shell.app.restart, undefined)
    } catch (error) {
      window.dispatchEvent(new Event(YIRU_APP_RESTART_ABORTED_EVENT))
      throw error
    }
  },
  startupDiagnostic: (event, details) =>
    callShellOrpc((client) => client.shell.app.startupDiagnostic, { event, details })
}

export const shellRepoHostApi: ShellRepoHostApi = {
  pickFolder: () => callShellOrpc((client) => client.shell.repoHost.pickFolder, undefined),
  pickFolders: () => callShellOrpc((client) => client.shell.repoHost.pickFolders, undefined),
  pickDirectory: () => callShellOrpc((client) => client.shell.repoHost.pickDirectory, undefined),
  removeForHost: (input) => callShellOrpc((client) => client.shell.repoHost.removeForHost, input),
  reorderForHost: (input) => callShellOrpc((client) => client.shell.repoHost.reorderForHost, input),
  cloneAbort: () => callShellOrpc((client) => client.shell.repoHost.cloneAbort, undefined),
  getDefaultCreateProjectParent: () =>
    callShellOrpc((client) => client.shell.repoHost.getDefaultCreateProjectParent, undefined)
}

export const shellRuntimeStateApi: ShellRuntimeStateApi = {
  syncWindowGraph: (input) =>
    callShellOrpc((client) => client.shell.runtime.syncWindowGraph, input),
  getTerminalFitOverrides: () =>
    callShellOrpc((client) => client.shell.runtime.getTerminalFitOverrides, undefined),
  getTerminalDrivers: () =>
    callShellOrpc((client) => client.shell.runtime.getTerminalDrivers, undefined),
  restoreTerminalFit: (ptyId) =>
    callShellOrpc((client) => client.shell.runtime.restoreTerminalFit, { ptyId })
}

export const shellGitHubApi: ShellGitHubApi = {
  viewer: () => callShellOrpc((client) => client.shell.gh.viewer, undefined),
  enqueuePRRefresh: (input) => callShellOrpc((client) => client.shell.gh.enqueuePRRefresh, input),
  reportVisiblePRRefreshCandidates: (input) =>
    callShellOrpc((client) => client.shell.gh.reportVisiblePRRefreshCandidates, input),
  checkYiruStarred: () => callShellOrpc((client) => client.shell.gh.checkYiruStarred, undefined),
  starYiru: (input) => callShellOrpc((client) => client.shell.gh.starYiru, input)
}

export const shellStarNagApi: ShellStarNagApi = {
  onShow: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'starNagShow') {
        callback({ mode: event.mode, surface: event.surface })
      }
    }),
  onHide: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'starNagHide') {
        callback()
      }
    }),
  dismiss: () => callShellOrpc((client) => client.shell.starNag.dismiss, undefined),
  later: () => callShellOrpc((client) => client.shell.starNag.later, undefined),
  complete: () => callShellOrpc((client) => client.shell.starNag.complete, undefined),
  disable: () => callShellOrpc((client) => client.shell.starNag.disable, undefined),
  openWeb: () => callShellOrpc((client) => client.shell.starNag.openWeb, undefined),
  starYiru: () => callShellOrpc((client) => client.shell.starNag.starYiru, undefined),
  forceShow: () => callShellOrpc((client) => client.shell.starNag.forceShow, undefined),
  agentValueMoment: () =>
    callShellOrpc((client) => client.shell.starNag.agentValueMoment, undefined),
  showAgentValueMoment: () =>
    callShellOrpc((client) => client.shell.starNag.showAgentValueMoment, undefined),
  onboardingCompleted: () =>
    callShellOrpc((client) => client.shell.starNag.onboardingCompleted, undefined)
}

export const shellUpdaterApi: ShellUpdaterApi = {
  getVersion: () => callShellOrpc((client) => client.shell.updater.getVersion, undefined),
  getStatus: () => callShellOrpc((client) => client.shell.updater.getStatus, undefined),
  check: (input) => callShellOrpc((client) => client.shell.updater.check, input),
  download: () => callShellOrpc((client) => client.shell.updater.download, undefined),
  quitAndInstall: async () => {
    await prepareShellRestart({
      startedEventName: YIRU_UPDATER_QUIT_AND_INSTALL_STARTED_EVENT,
      abortedEventName: YIRU_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT
    })
    try {
      await callShellOrpc((client) => client.shell.updater.quitAndInstall, undefined)
    } catch (error) {
      window.dispatchEvent(new Event(YIRU_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT))
      throw error
    }
  },
  onStatus: (callback) =>
    subscribeShellEvent((event) => {
      if (event.type === 'updaterStatus') {
        callback(event.status)
      }
    })
}

export const shellNotificationsApi: ShellNotificationsApi = daemonShellNotificationsApi
