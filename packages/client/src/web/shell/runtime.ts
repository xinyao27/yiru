import type { ShellRuntimeStateApi } from '~renderer/runtime/shell-system-client'
import type { RuntimeSyncWindowGraph } from '~shared/runtime-types'

import { callWebRuntimeProcedure } from '../runtime-connection'

export function createWebShellRuntimeApi(): ShellRuntimeStateApi {
  return {
    syncWindowGraph: async (_graph: RuntimeSyncWindowGraph) =>
      callWebRuntimeProcedure((client, options) => client.status.get(undefined, options), {
        timeoutMs: 15_000
      }),
    getTerminalFitOverrides: () => Promise.resolve([]),
    getTerminalDrivers: () => Promise.resolve([]),
    getBrowserDrivers: () => Promise.resolve([]),
    restoreTerminalFit: () => Promise.resolve({ restored: false }),
    reclaimBrowserForDesktop: () => Promise.resolve({ reclaimed: false })
  }
}
