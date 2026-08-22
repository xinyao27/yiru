import { parseRuntimeTerminalPtyId, toRuntimeTerminalPtyId } from '~shared/runtime-terminal-pty-id'

const durablePtyIdByRuntimePtyId = new Map<string, string>()

export function rememberTerminalSessionId(
  handle: string,
  durablePtyId: string,
  environmentId: string | null
): void {
  if (parseRuntimeTerminalPtyId(durablePtyId)) {
    return
  }
  durablePtyIdByRuntimePtyId.set(toRuntimeTerminalPtyId(handle, environmentId), durablePtyId)
}

export function getDurableTerminalSessionId(runtimePtyId: string): string | null {
  return durablePtyIdByRuntimePtyId.get(runtimePtyId) ?? null
}
