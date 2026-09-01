import { createWindowsMobileFirewallService } from '~main/mobile/windows-firewall/service'
import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'

export function createBunShellMobileHandlers(readMobileEndpoint: () => string | null) {
  const firewall = createWindowsMobileFirewallService(readMobileEndpoint)
  return {
    mobile: {
      getWindowsFirewallStatus: runtimeImplementation.shell.mobile.getWindowsFirewallStatus.handler(
        ({ input }) => firewall.inspect(input?.address)
      ),
      repairWindowsFirewall: runtimeImplementation.shell.mobile.repairWindowsFirewall.handler(() =>
        firewall.repair()
      ),
      openWindowsNetworkSettings:
        runtimeImplementation.shell.mobile.openWindowsNetworkSettings.handler(() =>
          firewall.openNetworkSettings()
        )
    }
  }
}
