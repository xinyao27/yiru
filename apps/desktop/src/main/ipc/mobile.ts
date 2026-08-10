import { ipcMain, type IpcMainInvokeEvent } from 'electron'

import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'
import { installMobileHostPairingBridge } from '../runtime/mobile-host-pairing-bridge'
import type { YiruRuntimeRpcServer } from '../runtime/rpc'
import {
  getWebSocketPort,
  inspectWindowsMobileFirewall,
  repairWindowsMobileFirewall,
  type WindowsMobileFirewallEnvironment
} from '../runtime/windows-mobile-firewall'

export type MobileHandlerDependencies = {
  firewallEnvironment?: WindowsMobileFirewallEnvironment
  openWindowsNetworkSettings?: () => Promise<void>
}

export function registerMobileHandlers(
  rpcServer: YiruRuntimeRpcServer,
  dependencies: MobileHandlerDependencies = {}
): void {
  const firewallEnvironment = dependencies.firewallEnvironment ?? {
    platform: process.platform,
    isPackaged: getRuntimeHostPathsProvider().isPackaged(),
    executablePath: getRuntimeHostPathsProvider().executablePath(),
    systemRoot: process.env.SystemRoot
  }

  installMobileHostPairingBridge(rpcServer)

  // Why: these are Electron-shell operations on the local Windows firewall,
  // not portable runtime-host capabilities.
  ipcMain.handle('mobile:getWindowsFirewallStatus', (_event, args?: { address?: string }) => {
    const port = getWebSocketPort(rpcServer.getWebSocketEndpoint())
    return inspectWindowsMobileFirewall(port, args?.address, firewallEnvironment)
  })

  ipcMain.handle('mobile:repairWindowsFirewall', (event: IpcMainInvokeEvent) => {
    if (!isWindowRenderer(event)) {
      return { ok: false as const, reason: 'unsupported' as const }
    }
    const port = getWebSocketPort(rpcServer.getWebSocketEndpoint())
    return repairWindowsMobileFirewall(port, firewallEnvironment)
  })

  ipcMain.handle('mobile:openWindowsNetworkSettings', async (event: IpcMainInvokeEvent) => {
    if (
      !isWindowRenderer(event) ||
      firewallEnvironment.platform !== 'win32' ||
      !dependencies.openWindowsNetworkSettings
    ) {
      return false
    }
    await dependencies.openWindowsNetworkSettings()
    return true
  })
}

function isWindowRenderer(event: IpcMainInvokeEvent): boolean {
  return !event.sender.isDestroyed() && event.sender.getType() === 'window'
}
