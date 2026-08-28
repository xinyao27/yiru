import { runtimeImplementation } from '~main/runtime/rpc/orpc/access-middleware'
import type { YiruRuntimeService } from '~main/runtime/yiru-runtime'
import type { DaemonRestart } from '~main/server/restart'
import { logRendererStartupMilestone } from '~main/startup/diagnostics'

import {
  callPublicRuntimeEnvironmentOrpcProcedure,
  subscribePublicRuntimeEnvironmentOrpcProcedure,
  disconnectPublicRuntimeEnvironment,
  getPublicRuntimeEnvironmentStatus,
  listPublicRuntimeEnvironments,
  removePublicRuntimeEnvironment,
  resolvePublicRuntimeEnvironment
} from '../../environments'

export function createBunShellSystemHandlers(
  runtime: YiruRuntimeService,
  restartDaemon: DaemonRestart
) {
  return {
    app: {
      getIdentity: runtimeImplementation.shell.app.getIdentity.handler(() => ({
        devBranch: null,
        devLabel: process.env.NODE_ENV === 'production' ? null : 'Dev',
        devRepoRoot: null,
        devWorktreeName: null,
        dockBadgeLabel: null,
        isDev: process.env.NODE_ENV !== 'production',
        name: 'Yiru'
      })),
      relaunch: runtimeImplementation.shell.app.relaunch.handler(() => restartDaemon()),
      restart: runtimeImplementation.shell.app.restart.handler(() => restartDaemon()),
      reload: runtimeImplementation.shell.app.reload.handler(() => undefined),
      awaitFirstWindowStartupServices:
        runtimeImplementation.shell.app.awaitFirstWindowStartupServices.handler(() => undefined),
      startupDiagnostic: runtimeImplementation.shell.app.startupDiagnostic.handler(({ input }) =>
        logRendererStartupMilestone(input.event, input.details)
      ),
      getKeyboardInputSourceId: runtimeImplementation.shell.app.getKeyboardInputSourceId.handler(
        () => null
      ),
      setUnreadDockBadgeCount: runtimeImplementation.shell.app.setUnreadDockBadgeCount.handler(
        () => undefined
      )
    },
    runtime: {
      // Why: the extension is one logical workbench surface; zero is its daemon graph owner.
      syncWindowGraph: runtimeImplementation.shell.runtime.syncWindowGraph.handler(({ input }) =>
        runtime.syncWindowGraph(0, input)
      ),
      getTerminalFitOverrides: runtimeImplementation.shell.runtime.getTerminalFitOverrides.handler(
        () =>
          Array.from(runtime.getAllTerminalFitOverrides().entries()).map(([ptyId, override]) => ({
            ptyId,
            ...override
          }))
      ),
      getTerminalDrivers: runtimeImplementation.shell.runtime.getTerminalDrivers.handler(() =>
        Array.from(runtime.getAllTerminalDrivers().entries()).map(([ptyId, driver]) => ({
          driver,
          ptyId
        }))
      ),
      restoreTerminalFit: runtimeImplementation.shell.runtime.restoreTerminalFit.handler(
        async ({ input }) => {
          try {
            return { restored: await runtime.reclaimTerminalForDesktop(input.ptyId) }
          } catch {
            return { restored: false }
          }
        }
      )
    },
    runtimeEnvironments: {
      list: runtimeImplementation.shell.runtimeEnvironments.list.handler(() =>
        listPublicRuntimeEnvironments()
      ),
      resolve: runtimeImplementation.shell.runtimeEnvironments.resolve.handler(({ input }) =>
        resolvePublicRuntimeEnvironment(input.selector)
      ),
      remove: runtimeImplementation.shell.runtimeEnvironments.remove.handler(({ input }) =>
        removePublicRuntimeEnvironment(input.selector)
      ),
      disconnect: runtimeImplementation.shell.runtimeEnvironments.disconnect.handler(({ input }) =>
        disconnectPublicRuntimeEnvironment(input.selector)
      ),
      getStatus: runtimeImplementation.shell.runtimeEnvironments.getStatus.handler(({ input }) =>
        getPublicRuntimeEnvironmentStatus(input.selector, input.timeoutMs)
      ),
      callOrpcProcedure: runtimeImplementation.shell.runtimeEnvironments.callOrpcProcedure.handler(
        ({ input }) => callPublicRuntimeEnvironmentOrpcProcedure(input)
      ),
      subscribeOrpcProcedure:
        runtimeImplementation.shell.runtimeEnvironments.subscribeOrpcProcedure.handler(
          async function* ({ input, signal }) {
            yield* subscribePublicRuntimeEnvironmentOrpcProcedure(input, signal)
          }
        )
    }
  }
}
