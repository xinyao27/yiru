import {
  TERMINAL_MULTIPLEX_RUNTIME_CAPABILITY,
  type RuntimeCapability
} from '@yiru/runtime-protocol/capabilities'

export const TERMINAL_MULTIPLEX_CANARY_ENV = 'YIRU_TERMINAL_MULTIPLEX_CANARY'

// Why: docs/reference/terminal-multiplex.md §25 keeps production capability
// advertisement closed until the cross-platform, soak, RTT, and iOS gates have
// real evidence. An exact opt-in keeps development and manual canaries possible
// without letting packaged builds silently publish an unfinished capability.
export function terminalMultiplexCanaryDisabledCapabilities(
  env: NodeJS.ProcessEnv = process.env
): readonly RuntimeCapability[] {
  return env[TERMINAL_MULTIPLEX_CANARY_ENV] === '1' ? [] : [TERMINAL_MULTIPLEX_RUNTIME_CAPABILITY]
}
