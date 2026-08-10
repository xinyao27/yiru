// Why: the reverse handoff mirrors `runtime-orpc-message-port.ts` but runs in
// the opposite direction — main hands the renderer the shell-services
// MessagePort instead of the other way around — so it gets its own channel
// name and message shape rather than overloading the forward one.
export const SHELL_SERVICES_CONNECT_CHANNEL = 'shellServices:connect-port'
export const SHELL_SERVICES_CONNECT_MESSAGE = 'yiru:shell-services-connect'

export type ShellServicesConnectMessage = {
  type: typeof SHELL_SERVICES_CONNECT_MESSAGE
}

export function parseShellServicesConnectMessage(
  value: unknown
): ShellServicesConnectMessage | null {
  if (!isRecord(value) || value.type !== SHELL_SERVICES_CONNECT_MESSAGE) {
    return null
  }
  return Object.keys(value).every((key) => key === 'type')
    ? { type: SHELL_SERVICES_CONNECT_MESSAGE }
    : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
