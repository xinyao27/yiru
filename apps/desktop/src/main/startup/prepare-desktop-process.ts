import os from 'node:os'

import { is } from '@electron-toolkit/utils'
import { app, net, session, systemPreferences } from 'electron'

import { setBrowserMediaAccessProvider } from '../browser/media-access'
import { setBrowserSessionProvider } from '../browser/session'
import { BrowserSessionPolicies } from '../browser/session-policies'
import { browserSessionRegistry } from '../browser/session-registry'
import { initClaudeUsagePath } from '../claude/usage/store'
import { initCodexUsagePath } from '../codex/usage/store'
import { recordCrashBreadcrumb } from '../crash-reporting/crash-breadcrumb-store'
import { CrashReportStore } from '../crash-reporting/crash-report-store'
import { startMainThreadChurnProbe } from '../diagnostics/main-thread-churn-probe'
import { getElectronSystemLocale } from '../i18n/electron-system-locale'
import { setMainSystemLocaleProvider } from '../i18n/main-i18n'
import { setHttpFetchProvider } from '../network/http-fetch'
import { initOpenCodeUsagePath } from '../opencode/usage/store'
import { initDataPath } from '../persistence'
import {
  MINIMAX_SESSION_PARTITION,
  setMiniMaxSessionProvider
} from '../rate-limits/minimax-request-context'
import { setRuntimeHostPathsProvider } from '../runtime/host/paths-provider'
import { configureRemoteServerUpdater } from '../runtime/remote-server-updater'
import { installServeSupervisorDisconnectQuit } from '../serve-update-handoff'
import { initStatsPath } from '../stats/collector'
import {
  checkForRemoteServerUpdate,
  configureRemoteServerUpdateInstallMode,
  downloadRemoteServerUpdate,
  getRemoteServerUpdaterSnapshot,
  installRemoteServerUpdate,
  resolveUpdateInstallMode
} from '../updater'
import { installWebConnectDeepLinkListeners } from '../web-connect/desktop-integration'
import { createElectronBrowserSessionProvider } from '../window/browser-session'
import { initYiruProfilePaths } from '../yiru-profiles/profile-index-store'
import { maybeRedirectAppImageCliLaunch } from './appimage-cli-redirect'
import {
  configureDevUserDataPath,
  configureElectronNetworkCompatibility,
  configureYiruUserDataPathEnv,
  enableMainProcessGpuFeatures,
  installDevParentDisconnectQuit,
  installDevParentSignalQuit,
  installDevParentWatchdog,
  installUncaughtPipeErrorGuard,
  patchPackagedProcessPath
} from './configure-process'
import type { DesktopMainState } from './desktop-main-state'
import { isStartupDiagnosticsEnabled, logStartupDiagnostic } from './diagnostics'
import { ensureVirtualDisplayForHeadlessServe } from './ensure-virtual-display'
import { startEventLoopStallProbe } from './event-loop-stall-probe'
import type { GpuCrashRecovery } from './gpu-crash-recovery'
import { hydrateShellPath, mergePathSegments } from './hydrate-shell-path'
import { maybeRedirectPackagedCliEntryLaunch } from './packaged-cli-entry-redirect'
import { enableRendererHeapHeadroom } from './renderer-heap-headroom'
import {
  acquireSingleInstanceLock,
  logSingleInstanceLockBypass,
  logSingleInstanceLockFailure,
  shouldBypassSingleInstanceLock,
  shouldSkipSingleInstanceLock
} from './single-instance-lock'

export function prepareDesktopProcess(options: {
  state: DesktopMainState
  isServeMode: boolean
  gpuCrashRecovery: GpuCrashRecovery
  requestDesktopActivation: () => void
}): { startupDiagnosticsEnabled: boolean } {
  const packagedRedirect = maybeRedirectPackagedCliEntryLaunch({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    execPath: process.execPath
  })
  if (packagedRedirect.redirected) {
    app.exit(packagedRedirect.status)
  }
  const appImageRedirect = maybeRedirectAppImageCliLaunch({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    execPath: process.execPath
  })
  if (appImageRedirect.redirected) {
    app.exit(appImageRedirect.status)
  }

  installUncaughtPipeErrorGuard()
  process.env.YIRU_APP_VERSION = app.getVersion()
  configureRemoteServerUpdater({
    getSnapshot: getRemoteServerUpdaterSnapshot,
    check: checkForRemoteServerUpdate,
    download: downloadRemoteServerUpdate,
    install: installRemoteServerUpdate
  })
  patchPackagedProcessPath()
  if (app.isPackaged && process.platform !== 'win32') {
    void hydrateShellPath().then((result) => {
      if (result.ok) {
        mergePathSegments(result.segments)
      }
    })
  }
  configureDevUserDataPath(is.dev)
  configureYiruUserDataPathEnv(is.dev)
  setMainSystemLocaleProvider(getElectronSystemLocale)
  setRuntimeHostPathsProvider({
    appPath: () => app.getAppPath(),
    downloadsPath: () => app.getPath('downloads'),
    executablePath: () => process.execPath,
    homePath: () => app.getPath('home'),
    isPackaged: () => app.isPackaged,
    resourcesPath: () => process.resourcesPath,
    tempPath: () => app.getPath('temp'),
    userDataPath: () => app.getPath('userData'),
    version: () => app.getVersion()
  })
  setHttpFetchProvider((input, init) => net.fetch(input, init))
  setMiniMaxSessionProvider(() => session.fromPartition(MINIMAX_SESSION_PARTITION))
  setBrowserMediaAccessProvider({
    hasAccess: (mediaType) => systemPreferences.getMediaAccessStatus(mediaType) === 'granted',
    requestAccess: (mediaType) => systemPreferences.askForMediaAccess(mediaType)
  })
  setBrowserSessionProvider(createElectronBrowserSessionProvider())
  browserSessionRegistry.setPolicies(new BrowserSessionPolicies())
  configureRemoteServerUpdateInstallMode(resolveUpdateInstallMode(options.isServeMode))
  installServeSupervisorDisconnectQuit(options.isServeMode)

  const startupDiagnosticsEnabled = isStartupDiagnosticsEnabled()
  if (startupDiagnosticsEnabled) {
    logStartupDiagnostic('before-single-instance-lock', {
      version: app.getVersion(),
      packaged: app.isPackaged,
      platform: process.platform,
      osRelease: os.release(),
      userData: app.getPath('userData')
    })
    startEventLoopStallProbe()
  }
  startMainThreadChurnProbe()

  const bypassLock = shouldBypassSingleInstanceLock({
    isDev: is.dev,
    isServeMode: options.isServeMode
  })
  const skipLock = shouldSkipSingleInstanceLock({ isDev: is.dev, isServeMode: options.isServeMode })
  if (bypassLock) {
    logSingleInstanceLockBypass()
  }
  const hasLock =
    skipLock || bypassLock || acquireSingleInstanceLock(app, options.requestDesktopActivation)
  if (startupDiagnosticsEnabled) {
    logStartupDiagnostic('single-instance-lock-result', {
      acquired: hasLock,
      bypassed: bypassLock,
      skippedForDev: skipLock
    })
  }
  if (!hasLock) {
    logSingleInstanceLockFailure()
    app.quit()
  }
  installWebConnectDeepLinkListeners()

  if (hasLock) {
    const coupleToDevParent = is.dev && !options.isServeMode
    installDevParentDisconnectQuit(coupleToDevParent)
    installDevParentWatchdog(coupleToDevParent)
    installDevParentSignalQuit(coupleToDevParent)
    initDataPath(app.getPath('userData'))
    initYiruProfilePaths()
    initStatsPath()
    initClaudeUsagePath()
    initCodexUsagePath()
    initOpenCodeUsagePath()
    options.state.crashReports = CrashReportStore.fromUserData()
    recordCrashBreadcrumb('app_started', {
      packaged: app.isPackaged,
      platform: process.platform
    })
    configureElectronNetworkCompatibility()
    enableRendererHeapHeadroom()
    options.gpuCrashRecovery.applyForLaunch()
    if (!options.gpuCrashRecovery.isFallbackActive()) {
      enableMainProcessGpuFeatures()
    }
    options.state.headlessBrowserDisplayAvailable = ensureVirtualDisplayForHeadlessServe({
      isServeMode: options.isServeMode
    })
  }
  return { startupDiagnosticsEnabled }
}
