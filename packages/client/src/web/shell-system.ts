import { getDefaultCreateProjectParent } from '~renderer/components/sidebar/create-project-defaults'
import { translate } from '~renderer/i18n/i18n'
import type { RuntimeSyncWindowGraph } from '~shared/runtime-types'

import type { ShellNotificationsApi } from '../runtime/shell-notifications-client'
import type {
  ShellAppApi,
  ShellGitHubApi,
  ShellRepoHostApi,
  ShellRuntimeStateApi,
  ShellStarNagApi,
  ShellUpdaterApi
} from '../runtime/shell-system-client'
import { callWebRuntimeProcedure } from './runtime-connection'

const webShellAppApi: ShellAppApi = {
  getIdentity: () =>
    Promise.resolve({
      name: 'Yiru',
      isDev: false,
      devLabel: null,
      devBranch: null,
      devWorktreeName: null,
      devRepoRoot: null,
      dockBadgeLabel: null
    }),
  relaunch: () => Promise.resolve(window.location.reload()),
  restart: () => Promise.resolve(window.location.reload()),
  reload: () => Promise.resolve(window.location.reload()),
  awaitFirstWindowStartupServices: () => Promise.resolve(),
  startupDiagnostic: () => Promise.resolve(),
  getKeyboardInputSourceId: () => Promise.resolve(null),
  setUnreadDockBadgeCount: () => Promise.resolve(),
  getFloatingTerminalCwd: () => Promise.resolve(''),
  getFloatingMarkdownDirectory: () => Promise.resolve(''),
  pickFloatingMarkdownDocument: () => Promise.resolve(null),
  pickFloatingWorkspaceDirectory: () => Promise.resolve(null)
}

const webShellStarNagApi: ShellStarNagApi = {
  onShow: () => noopUnsubscribe,
  onHide: () => noopUnsubscribe,
  dismiss: () => Promise.resolve(),
  later: () => Promise.resolve(),
  complete: () => Promise.resolve(),
  disable: () => Promise.resolve(),
  openWeb: () => Promise.resolve(),
  starYiru: () => Promise.resolve(false),
  forceShow: () => Promise.resolve(),
  agentValueMoment: () => Promise.resolve({ status: 'skipped' }),
  showAgentValueMoment: () => Promise.resolve(),
  onboardingCompleted: () => Promise.resolve()
}

export function getWebShellSystemApis(): {
  app: ShellAppApi
  repoHost: ShellRepoHostApi
  runtime: ShellRuntimeStateApi
  gh: ShellGitHubApi
  notifications: ShellNotificationsApi
  starNag: ShellStarNagApi
  updater: ShellUpdaterApi
} {
  return {
    app: webShellAppApi,
    repoHost: createRepoHostAdapter(),
    runtime: createRuntimeApi(),
    gh: createGitHubApi(),
    notifications: createNotificationsApi(),
    starNag: webShellStarNagApi,
    updater: createUpdaterApi()
  }
}

function createRepoHostAdapter(): ShellRepoHostApi {
  return {
    pickFolder: () => Promise.resolve(null),
    pickFolders: () => Promise.resolve([]),
    pickDirectory: () => Promise.resolve(null),
    removeForHost: () => {
      throw new Error(
        translate('auto.web.web.preload.api.31bfe8ae1a', 'Unavailable in the web client.')
      )
    },
    reorderForHost: async () => {
      throw new Error(
        translate('auto.web.web.preload.api.31bfe8ae1a', 'Unavailable in the web client.')
      )
    },
    cloneAbort: () => Promise.resolve(),
    getDefaultCreateProjectParent: async () => {
      const result = await callWebRuntimeProcedure((client, options) =>
        client.files.browseServerDir({ path: '~' }, options)
      )
      return getDefaultCreateProjectParent(result.resolvedPath)
    }
  }
}

function createRuntimeApi(): ShellRuntimeStateApi {
  return {
    syncWindowGraph: async (_graph: RuntimeSyncWindowGraph) =>
      callWebRuntimeProcedure((client, options) => client.status.get(undefined, options), {
        timeoutMs: 15_000
      }),
    getTerminalFitOverrides: () => Promise.resolve([]),
    getTerminalDrivers: () => Promise.resolve([]),
    getBrowserDrivers: () => Promise.resolve([]),
    restoreTerminalFit: () => Promise.resolve({ restored: false }),
    reclaimBrowserForDesktop: () => Promise.resolve({ reclaimed: false })
  }
}

function createGitHubApi(): ShellGitHubApi {
  return {
    viewer: () => Promise.resolve(null),
    enqueuePRRefresh: () => Promise.resolve(false),
    reportVisiblePRRefreshCandidates: () => Promise.resolve(false),
    checkYiruStarred: () => Promise.resolve(null),
    starYiru: () => Promise.resolve(false)
  }
}

function createNotificationsApi(): ShellNotificationsApi {
  return {
    displayNative: () => Promise.resolve({ delivered: false, reason: 'not-supported' }),
    dismissNative: () => Promise.resolve({ dismissed: 0 }),
    openSystemSettings: () => Promise.resolve(),
    getPermissionStatus: () =>
      Promise.resolve({ supported: false, platform: getBrowserPlatform(), requested: false }),
    probeDelivery: () => Promise.resolve({ state: 'unsupported', authoritative: false }),
    playSound: () => Promise.resolve({ played: false, reason: 'missing-path' })
  }
}

function createUpdaterApi(): ShellUpdaterApi {
  return {
    getVersion: () => Promise.resolve('web'),
    getStatus: () => Promise.resolve({ state: 'idle' }),
    check: () => Promise.resolve(),
    download: () => Promise.resolve(),
    quitAndInstall: () => Promise.resolve(),
    dismissNudge: () => Promise.resolve(),
    onStatus: () => noopUnsubscribe,
    onClearDismissal: () => noopUnsubscribe
  }
}

function getBrowserPlatform(): NodeJS.Platform {
  if (navigator.userAgent.includes('Mac')) {
    return 'darwin'
  }
  return navigator.userAgent.includes('Windows') ? 'win32' : 'linux'
}

function noopUnsubscribe(): void {}
