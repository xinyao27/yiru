import { app, shell, type BrowserWindow } from 'electron'

import { initializeShellMobileService } from '../mobile/shell-service'
import {
  getCanonicalUserDataPath,
  migrateMobilePairingDataToCanonicalUserDataPath
} from '../persistence'
import { registerRuntimeLoopbackCredentials } from '../runtime/loopback/credentials'
import { YiruRuntimeRpcServer } from '../runtime/rpc'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import { getBundledWebClientRoot, getServeOptions, type ServeOptions } from '../serve/readiness'
import { publishShellEvent } from '../shell/events'
import { initializeWebConnect } from '../web-connect/desktop-integration'

export type RuntimeHostTransport = {
  runtimeRpc: YiruRuntimeRpcServer
  serveOptions: ServeOptions | null
}

export function initializeRuntimeHostTransport(options: {
  runtime: YiruRuntimeService
  isDev: boolean
  isServeMode: boolean
  getMainWindow: () => BrowserWindow | null
  requestDesktopActivation: () => void
}): RuntimeHostTransport {
  const hasIsolatedUserData = Boolean(process.env.YIRU_APP_USER_DATA_PATH)
  const devWsPort = options.isDev && !hasIsolatedUserData ? 6769 : undefined
  const serveOptions = options.isServeMode ? getServeOptions() : null
  migrateMobilePairingDataToCanonicalUserDataPath(app.getPath('userData'))
  const runtimeRpc = new YiruRuntimeRpcServer({
    runtime: options.runtime,
    userDataPath: getCanonicalUserDataPath(),
    enableWebSocket: true,
    enableDevelopmentMobilePairing: options.isDev,
    ...(hasIsolatedUserData ? { wsPort: 0 } : {}),
    ...(devWsPort !== undefined ? { wsPort: devWsPort } : {}),
    ...(serveOptions?.wsPort !== undefined
      ? { wsPort: serveOptions.wsPort, preferPinnedWsPort: true }
      : {}),
    webClientRoot: getBundledWebClientRoot()
  })
  registerRuntimeLoopbackCredentials(runtimeRpc)
  initializeShellMobileService(runtimeRpc, {
    openWindowsNetworkSettings: () => shell.openExternal('ms-settings:network-status')
  })
  if (!serveOptions) {
    initializeWebConnect({
      userDataPath: getCanonicalUserDataPath(),
      resolveTarget: (name) => runtimeRpc.createWebConnectTarget(name),
      onStatusChange: (status) => {
        const mainWindow = options.getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          publishShellEvent(mainWindow.webContents.id, { type: 'webConnectStatus', status })
        }
        if (status.pendingVerification) {
          options.requestDesktopActivation()
        }
      },
      reportError: (message, error) => {
        console.error(message, error)
      }
    })
  }
  return { runtimeRpc, serveOptions }
}
