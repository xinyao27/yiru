import { handleDiagnosticsMemory } from '~main/runtime/rpc/methods/diagnostics'
import { handleStatsSummary } from '~main/runtime/rpc/methods/stats'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: diagnostics and stats both answer "what is this host doing right
// now" (memory/CPU use, provider usage counters) — read-only telemetry, as
// opposed to host-tooling.ts's static capability probes.
export const hostTelemetryRuntimeHandlers = {
  diagnostics: {
    memory: runtimeImplementation.diagnostics.memory.handler(
      wireRuntimeMethod('diagnostics.memory', handleDiagnosticsMemory)
    )
  },
  stats: {
    summary: runtimeImplementation.stats.summary.handler(
      wireRuntimeMethod('stats.summary', handleStatsSummary)
    )
  }
} as const
