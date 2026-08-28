import { getShellMiniMaxCredentialsService } from '~main/agents/minimax/credentials'
import { registerShellLocalhostWorktreeLabel } from '~main/ports/localhost-worktree-labels'
import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'
import {
  acknowledgeShellTelemetryBanner,
  getShellTelemetryConsentState,
  setShellTelemetryOptIn,
  trackShellTelemetry
} from '~main/telemetry/telemetry'

export function createBunShellToolHandlers() {
  return {
    localhostWorktreeLabels: {
      register: runtimeImplementation.shell.localhostWorktreeLabels.register.handler(({ input }) =>
        registerShellLocalhostWorktreeLabel(input)
      )
    },
    minimaxCredentials: {
      getStatus: runtimeImplementation.shell.minimaxCredentials.getStatus.handler(() =>
        getShellMiniMaxCredentialsService().getStatus()
      ),
      saveCookie: runtimeImplementation.shell.minimaxCredentials.saveCookie.handler(({ input }) =>
        getShellMiniMaxCredentialsService().saveCookie(input.cookie)
      ),
      clearCookie: runtimeImplementation.shell.minimaxCredentials.clearCookie.handler(() =>
        getShellMiniMaxCredentialsService().clearCookie()
      )
    },
    telemetry: {
      track: runtimeImplementation.shell.telemetry.track.handler(({ input }) => {
        const request = readTelemetryRequest(input)
        trackShellTelemetry(request.name, request.props)
      }),
      setOptIn: runtimeImplementation.shell.telemetry.setOptIn.handler(({ input }) =>
        setShellTelemetryOptIn(input.optedIn)
      ),
      getConsentState: runtimeImplementation.shell.telemetry.getConsentState.handler(() =>
        getShellTelemetryConsentState()
      ),
      acknowledgeBanner: runtimeImplementation.shell.telemetry.acknowledgeBanner.handler(() =>
        acknowledgeShellTelemetryBanner()
      )
    }
  }
}

function readTelemetryRequest(value: unknown): { name: unknown; props: unknown } {
  return value && typeof value === 'object'
    ? { name: Reflect.get(value, 'name'), props: Reflect.get(value, 'props') }
    : { name: undefined, props: undefined }
}
