import { is } from '@electron-toolkit/utils'
import { app } from 'electron'
import type { RuntimeDesktopWindowStatus } from '~shared/runtime-types'

import { createCodexRuntimeLaunchPreparation } from './codex/runtime-launch-preparation'
import { LocalPtyProvider } from './providers/local-pty-provider'
import { getLocalPtyProvider } from './pty/pty'
import { initializeShellAppStartupService } from './shell/app-startup'
import { registerAppShutdown } from './startup/app-shutdown'
import { DesktopMainState } from './startup/desktop-main-state'
import { getDevInstanceIdentity } from './startup/dev-instance-identity'
import { logStartupMilestone } from './startup/diagnostics'
import { GpuCrashRecovery } from './startup/gpu-crash-recovery'
import { ManagedWslCliStartup } from './startup/managed-wsl-cli-startup'
import { prepareDesktopProcess } from './startup/prepare-desktop-process'
import { createServeDesktopActivationGate } from './startup/serve-desktop-activation'
import { startDesktopApplication } from './startup/start-desktop-application'
import { isQuittingForUpdate } from './updater'
import { DesktopWindowController } from './window/desktop-window-controller'

const desktopState = new DesktopMainState()
const managedWslCliStartup = new ManagedWslCliStartup()
const isServeMode = process.argv.includes('--serve')
const devInstanceIdentity = getDevInstanceIdentity(is.dev)
const devAgentHookEndpointNamespace = devInstanceIdentity.isDev
  ? devInstanceIdentity.appUserModelId
  : undefined
const prepareCodexRuntimeHomeForLaunch = createCodexRuntimeLaunchPreparation({
  getStore: () => desktopState.store,
  getRuntimeHome: () => desktopState.codexRuntimeHome
})
const gpuCrashRecovery = new GpuCrashRecovery({
  isServeMode,
  isAppQuitting: () => desktopState.isQuitting,
  onQuit: () => {
    desktopState.isQuitting = true
  }
})

const desktopActivationGate = createServeDesktopActivationGate({
  initialState: isServeMode ? 'initializing' : 'ready',
  activateWindow: () => {
    if (!isQuittingForUpdate()) {
      desktopWindows.focusExisting()
    }
  },
  onBlocked: (reason) => console.error(`[serve] Desktop activation blocked: ${reason}`)
})
const requestDesktopActivation = (): void => {
  desktopActivationGate.requestActivation()
}
const getDesktopWindowStatus = (): RuntimeDesktopWindowStatus => {
  const status = desktopActivationGate.getState()
  return status === 'ready' ? 'openable' : status
}
const settleServeDesktopActivation = (): void => {
  if (getLocalPtyProvider() instanceof LocalPtyProvider) {
    desktopActivationGate.markBlocked('persistent PTY provider unavailable')
    return
  }
  desktopActivationGate.markReady()
}

const { startupDiagnosticsEnabled } = prepareDesktopProcess({
  state: desktopState,
  isServeMode,
  gpuCrashRecovery,
  requestDesktopActivation
})
initializeShellAppStartupService({
  awaitFirstWindowStartupServices: async () => {
    await Promise.all([
      desktopState.firstWindowStartupServicesReady,
      managedWslCliStartup.waitForStartupBarrier()
    ])
  },
  startupDiagnostic: (event, details) => {
    if (!startupDiagnosticsEnabled || !event.startsWith('renderer-')) {
      return
    }
    logStartupMilestone(event, details && typeof details === 'object' ? details : {})
  }
})

const desktopWindows = new DesktopWindowController({
  identity: devInstanceIdentity,
  isServeMode,
  isQuitting: () => desktopState.isQuitting,
  setQuitting: (quitting) => {
    desktopState.isQuitting = quitting
  },
  getServices: () => desktopState.getMainWindowServices(),
  getStore: () => desktopState.store,
  getRuntime: () => desktopState.runtime,
  getCrashReports: () => desktopState.crashReports,
  awaitLocalPtyStartup: () => desktopState.localPtyStartupReady,
  prepareForCodexLaunch: prepareCodexRuntimeHomeForLaunch
})

app.whenReady().then(() =>
  startDesktopApplication({
    state: desktopState,
    windows: desktopWindows,
    identity: devInstanceIdentity,
    ...(devAgentHookEndpointNamespace ? { devAgentHookEndpointNamespace } : {}),
    isServeMode,
    gpuCrashRecovery,
    managedWslCliStartup,
    requestDesktopActivation,
    getDesktopWindowStatus,
    settleServeDesktopActivation,
    prepareForCodexLaunch: prepareCodexRuntimeHomeForLaunch
  })
)

registerAppShutdown({
  isServeMode,
  isQuitting: () => desktopState.isQuitting,
  setQuitting: () => {
    desktopState.isQuitting = true
  },
  getServices: () => desktopState
})
