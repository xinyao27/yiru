import { getRuntimeHostPathsProvider } from '../runtime/host/paths-provider'
import { installMobileHostPairingBridge } from '../runtime/mobile-host-pairing-bridge'
import type { YiruRuntimeRpcServer } from '../runtime/rpc'
import {
  getWebSocketPort,
  inspectWindowsMobileFirewall,
  repairWindowsMobileFirewall,
  type WindowsMobileFirewallEnvironment
} from '../runtime/windows-mobile-firewall'

export type MobileShellDependencies = {
  firewallEnvironment?: WindowsMobileFirewallEnvironment
  openWindowsNetworkSettings?: () => Promise<void>
}

let mobileService: ReturnType<typeof createMobileService> | null = null

export function initializeShellMobileService(
  rpcServer: YiruRuntimeRpcServer,
  dependencies: MobileShellDependencies = {}
): void {
  installMobileHostPairingBridge(rpcServer)
  mobileService = createMobileService(rpcServer, dependencies)
}

export function getShellMobileService() {
  if (!mobileService) {
    throw new Error('unavailable_on_host: shell mobile service is not initialized')
  }
  return mobileService
}

function createMobileService(
  rpcServer: YiruRuntimeRpcServer,
  dependencies: MobileShellDependencies
) {
  const firewallEnvironment = dependencies.firewallEnvironment ?? {
    platform: process.platform,
    isPackaged: getRuntimeHostPathsProvider().isPackaged(),
    executablePath: getRuntimeHostPathsProvider().executablePath(),
    systemRoot: process.env.SystemRoot
  }

  return {
    getWindowsFirewallStatus: (address?: string) => {
      const port = getWebSocketPort(rpcServer.getWebSocketEndpoint())
      return inspectWindowsMobileFirewall(port, address, firewallEnvironment)
    },
    repairWindowsFirewall: () => {
      const port = getWebSocketPort(rpcServer.getWebSocketEndpoint())
      return repairWindowsMobileFirewall(port, firewallEnvironment)
    },
    openWindowsNetworkSettings: async (): Promise<boolean> => {
      if (firewallEnvironment.platform !== 'win32' || !dependencies.openWindowsNetworkSettings) {
        return false
      }
      await dependencies.openWindowsNetworkSettings()
      return true
    }
  }
}
