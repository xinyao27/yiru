import type {
  RuntimeBrowserDriverState,
  RuntimeSyncWindowGraph,
  RuntimeSyncWindowGraphResult,
  RuntimeTerminalDriverState
} from '~shared/runtime-types'

import { registerRuntimeOrpcMessagePortHandler } from '../runtime/rpc/orpc/message-port-handler'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'

export function initializeShellRuntimeStateService(runtime: YiruRuntimeService): void {
  registerRuntimeOrpcMessagePortHandler(runtime)
  shellRuntimeStateService = createShellRuntimeStateService(runtime)
}

type ShellRuntimeStateService = ReturnType<typeof createShellRuntimeStateService>

let shellRuntimeStateService: ShellRuntimeStateService | null = null

export function getShellRuntimeStateService(): ShellRuntimeStateService {
  if (!shellRuntimeStateService) {
    throw new Error('shell_runtime_state_service_unavailable')
  }
  return shellRuntimeStateService
}

function createShellRuntimeStateService(runtime: YiruRuntimeService) {
  const getTerminalFitOverrides = (): {
    ptyId: string
    mode: 'mobile-fit' | 'remote-desktop-fit'
    cols: number
    rows: number
  }[] =>
    Array.from(runtime.getAllTerminalFitOverrides().entries()).map(([ptyId, override]) => ({
      ptyId,
      ...override
    }))

  const getTerminalDrivers = (): { ptyId: string; driver: RuntimeTerminalDriverState }[] =>
    Array.from(runtime.getAllTerminalDrivers().entries()).map(([ptyId, driver]) => ({
      ptyId,
      driver
    }))

  const getBrowserDrivers = (): { browserPageId: string; driver: RuntimeBrowserDriverState }[] =>
    Array.from(runtime.browserCommands.getDrivers().entries()).map(([browserPageId, driver]) => ({
      browserPageId,
      driver
    }))

  const restoreTerminalFit = async (ptyId: string): Promise<{ restored: boolean }> => {
    // Why: reclaimTerminalForDesktop includes the awaited PTY resize; returning
    // that promise directly makes Electron try to structured-clone a Promise.
    try {
      return { restored: await runtime.reclaimTerminalForDesktop(ptyId) }
    } catch {
      return { restored: false }
    }
  }

  const reclaimBrowserForDesktop = (browserPageId: string): { reclaimed: boolean } => {
    try {
      return { reclaimed: runtime.browserCommands.reclaimForDesktop(browserPageId) }
    } catch {
      return { reclaimed: false }
    }
  }

  return {
    syncWindowGraph: (
      windowId: number,
      graph: RuntimeSyncWindowGraph
    ): RuntimeSyncWindowGraphResult => runtime.syncWindowGraph(windowId, graph),
    getTerminalFitOverrides,
    getTerminalDrivers,
    getBrowserDrivers,
    restoreTerminalFit,
    reclaimBrowserForDesktop
  }
}
