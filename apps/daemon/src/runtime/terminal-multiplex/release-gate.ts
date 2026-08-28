import {
  TERMINAL_MULTIPLEX_RUNTIME_CAPABILITY,
  type RuntimeCapability
} from '@yiru/runtime-protocol/protocol-version'

export const TERMINAL_MULTIPLEX_DISABLE_ENV = 'YIRU_TERMINAL_MULTIPLEX_DISABLED'

// Why: Web and mobile clients refuse to open a bulk ticket unless the host
// advertises this capability, so withholding it left every paired browser with a
// live PTY behind an empty terminal and a 250 ms status.get reconnect loop.
// Advertisement is the default; this switch is the one way to take it back off on
// a host that hits trouble.
export function terminalMultiplexDisabledCapabilities(
  env: NodeJS.ProcessEnv = process.env
): readonly RuntimeCapability[] {
  return env[TERMINAL_MULTIPLEX_DISABLE_ENV] === '1' ? [TERMINAL_MULTIPLEX_RUNTIME_CAPABILITY] : []
}
