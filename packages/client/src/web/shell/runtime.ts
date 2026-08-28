import type { RuntimeSyncWindowGraph } from '@yiru/runtime-protocol/workbench/runtime-types'
import type { ShellRuntimeStateApi } from '~renderer/runtime/shell-system-client'

import { callWebRuntimeProcedure } from '../runtime-connection'

export function createWebShellRuntimeApi(): ShellRuntimeStateApi {
  return {
    syncWindowGraph: async (_graph: RuntimeSyncWindowGraph) =>
      callWebRuntimeProcedure((client, options) => client.status.get(undefined, options), {
        timeoutMs: 15_000
      }),
    getTerminalFitOverrides: () => Promise.resolve([]),
    getTerminalDrivers: () => Promise.resolve([]),
    restoreTerminalFit: () => Promise.resolve({ restored: false })
  }
}
