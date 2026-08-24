import { is } from '@electron-toolkit/utils'
import { app, nativeTheme } from 'electron'
import type { RuntimeDesktopWindowStatus } from '~shared/runtime-types'

import { runManagedHookInstallers } from '../agent-hooks/install-telemetry'
import {
  isAgentStatusHooksEnabled,
  MANAGED_AGENT_HOOK_INSTALLERS,
  removeManagedAgentHooks
} from '../agent-hooks/managed-agent-hook-controls'
import { ensureRealHomeCodexHookState } from '../codex/real-home-hook-install'
import type { createCodexRuntimeLaunchPreparation } from '../codex/runtime-launch-preparation'
import { recordCrashBreadcrumb } from '../crash-reporting/crash-breadcrumb-store'
import { isGpuFallbackCrashCandidate } from '../crash-reporting/gpu-crash-fallback-decision'
import { setMainUiLanguage } from '../i18n/main-i18n'
import { registerMainProcessMenu } from '../menu/register-main-process-menu'
import { startHeadlessRuntime } from '../serve/start-headless-runtime'
import type { DesktopWindowController } from '../window/desktop-window-controller'
import { initializeAccountServices } from './account-services'
import { initializeAppReadyPlatform } from './app-ready-platform'
import { shouldInstallManagedHooks } from './configure-process'
import type { DesktopMainState } from './desktop-main-state'
import type { DevInstanceIdentity } from './dev-instance-identity'
import { logStartupMilestone } from './diagnostics'
import type { GpuCrashRecovery } from './gpu-crash-recovery'
import { initializeDesktopStore } from './initialize-desktop-store'
import type { ManagedWslCliStartup } from './managed-wsl-cli-startup'
import { initializeRuntimeHostTransport } from './runtime-host-transport'
import { initializeRuntimeServices } from './runtime-services'
import { startWindowedRuntime } from './start-windowed-runtime'
import { startTerminalRuntimeStartup } from './terminal-runtime-startup'

export async function startDesktopApplication(options: {
  state: DesktopMainState
  windows: DesktopWindowController
  identity: DevInstanceIdentity
  devAgentHookEndpointNamespace?: string
  isServeMode: boolean
  gpuCrashRecovery: GpuCrashRecovery
  managedWslCliStartup: ManagedWslCliStartup
  requestDesktopActivation: () => void
  getDesktopWindowStatus: () => RuntimeDesktopWindowStatus
  settleServeDesktopActivation: () => void
  prepareForCodexLaunch: ReturnType<typeof createCodexRuntimeLaunchPreparation>
}): Promise<void> {
  const { state } = options
  logStartupMilestone('app-ready')
  initializeAppReadyPlatform(options.identity)
  options.managedWslCliStartup.start()

  const storeStartup = await initializeDesktopStore({
    syncMacMenuBarIcon: (visible) => {
      options.windows.syncMacMenuBarIcon(visible)
    },
    refreshRateLimits: () => {
      void state.rateLimits?.refresh()
    }
  })
  state.store = storeStartup.store
  state.agentAwakeService = storeStartup.agentAwakeService
  state.unsubscribeAgentAwakeStatusChanges = storeStartup.unsubscribeAgentAwakeStatusChanges
  state.unsubscribeSystemResumeBroadcast = storeStartup.unsubscribeSystemResumeBroadcast
  state.unsubscribeWindowFocusBroadcast = storeStartup.unsubscribeWindowFocusBroadcast

  const accountServices = initializeAccountServices(storeStartup.store, {
    isQuitting: () => state.isQuitting
  })
  state.stats = accountServices.stats
  state.rateLimits = accountServices.rateLimits
  state.codexRuntimeHome = accountServices.codexRuntimeHome
  state.claudeRuntimeAuth = accountServices.claudeRuntimeAuth
  state.keybindings = accountServices.keybindings
  const runtimeStartup = initializeRuntimeServices({
    store: storeStartup.store,
    accounts: accountServices,
    isServeMode: options.isServeMode,
    getDesktopWindowStatus: options.getDesktopWindowStatus,
    prepareForCodexLaunch: options.prepareForCodexLaunch
  })
  state.runtime = runtimeStartup.runtime
  state.rateLimitResumes = runtimeStartup.rateLimitResumes
  state.starNag = runtimeStartup.starNag

  nativeTheme.themeSource = storeStartup.store.getSettings().theme ?? 'system'
  if (accountServices.codexRuntimeHome.isHostSystemDefaultRealHomeSelected()) {
    ensureRealHomeCodexHookState({
      hooksEnabled: isAgentStatusHooksEnabled(storeStartup.store.getSettings()),
      userDataPath: app.getPath('userData')
    })
  }
  if (shouldInstallManagedHooks(is.dev)) {
    if (isAgentStatusHooksEnabled(storeStartup.store.getSettings())) {
      runManagedHookInstallers(MANAGED_AGENT_HOOK_INSTALLERS)
    } else {
      removeManagedAgentHooks()
    }
  }
  app.on('child-process-gone', (_event, details) => {
    options.windows.recordProcessGone(
      'child',
      details.type,
      details.reason,
      details.exitCode ?? null,
      { name: details.name, serviceName: details.serviceName, type: details.type }
    )
    if (
      isGpuFallbackCrashCandidate({
        platform: process.platform,
        processType: details.type,
        reason: details.reason
      })
    ) {
      options.gpuCrashRecovery.handleChildCrash(details.reason, details.exitCode ?? null)
    }
  })
  logStartupMilestone('services-initialized')
  setMainUiLanguage(storeStartup.store.getSettings().uiLanguage)
  logStartupMilestone('i18n-ready')

  registerMainProcessMenu({
    getMainWindow: options.windows.getWindow,
    getStore: () => state.store,
    getKeybindings: () => state.keybindings?.getOverrides(),
    checkForUpdates: options.windows.runUpdateCheck,
    beforeReload: ({ ignoreCache, webContentsId }) => {
      options.windows.markExpectedReload(webContentsId)
      recordCrashBreadcrumb('manual_reload_requested', { ignoreCache })
    },
    openSettings: options.windows.openSettings,
    openSetupGuide: (targetWindow) => {
      recordCrashBreadcrumb('setup_guide_opened')
      options.windows.sendOpenSetupGuide(targetWindow)
    },
    openCrashReport: (targetWindow) => {
      recordCrashBreadcrumb('crash_report_opened')
      options.windows.sendOpenCrashReport(targetWindow)
    },
    openFeatureTour: (targetWindow) => {
      recordCrashBreadcrumb('feature_tour_opened')
      options.windows.sendOpenFeatureTour(targetWindow)
    }
  })

  const hostTransport = initializeRuntimeHostTransport({
    runtime: runtimeStartup.runtime,
    isDev: is.dev,
    isServeMode: options.isServeMode,
    getMainWindow: options.windows.getWindow,
    requestDesktopActivation: options.requestDesktopActivation
  })
  state.runtimeRpc = hostTransport.runtimeRpc
  const terminalStartup = startTerminalRuntimeStartup({
    store: storeStartup.store,
    ...(options.devAgentHookEndpointNamespace
      ? { agentHookEndpointNamespace: options.devAgentHookEndpointNamespace }
      : {})
  })
  state.firstWindowStartupServicesReady = terminalStartup.firstWindowReady
  state.localPtyStartupReady = terminalStartup.localPtyReady
  app.on('activate', options.requestDesktopActivation)

  if (hostTransport.serveOptions) {
    await startHeadlessRuntime({
      serveOptions: hostTransport.serveOptions,
      store: storeStartup.store,
      runtime: runtimeStartup.runtime,
      runtimeRpc: hostTransport.runtimeRpc,
      claudeRuntimeAuth: accountServices.claudeRuntimeAuth,
      prepareForCodexLaunch: options.prepareForCodexLaunch,
      localPtyReady: terminalStartup.localPtyReady,
      managedWslCliStartup: options.managedWslCliStartup,
      headlessBrowserDisplayAvailable: state.headlessBrowserDisplayAvailable,
      settleDesktopActivation: options.settleServeDesktopActivation
    })
    return
  }

  const windowedRuntime = await startWindowedRuntime({
    store: storeStartup.store,
    runtime: runtimeStartup.runtime,
    runtimeRpc: hostTransport.runtimeRpc,
    rateLimits: accountServices.rateLimits,
    profileId: storeStartup.profileId,
    openMainWindow: options.windows.open
  })
  state.coworkingOwner = windowedRuntime.coworkingOwner
  state.unregisterCoworkingSharingController = windowedRuntime.unregisterCoworkingSharingController
}
