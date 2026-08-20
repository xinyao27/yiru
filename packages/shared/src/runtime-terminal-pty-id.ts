// Why: these ids are persisted in workspace sessions and survive app updates.
// The encoder output is the only accepted spelling so every producer and a
// later renderer attach to the same runtime terminal without format drift.
const RUNTIME_TERMINAL_PTY_ID_PREFIX = 'runtime:'
const RUNTIME_TERMINAL_OWNER_SEPARATOR = '@@'

export type RuntimeTerminalPtyIdParts = {
  environmentId: string | null
  handle: string
}

function isCanonicalPart(value: string): boolean {
  return value.length > 0 && value.trim() === value
}

export function toRuntimeTerminalPtyId(handle: string, environmentId?: string | null): string {
  if (!isCanonicalPart(handle)) {
    throw new Error('runtime_terminal_handle_invalid')
  }
  if (environmentId === undefined || environmentId === null) {
    return `${RUNTIME_TERMINAL_PTY_ID_PREFIX}${encodeURIComponent(handle)}`
  }
  if (!isCanonicalPart(environmentId)) {
    throw new Error('runtime_terminal_environment_invalid')
  }
  return `${RUNTIME_TERMINAL_PTY_ID_PREFIX}${encodeURIComponent(environmentId)}${RUNTIME_TERMINAL_OWNER_SEPARATOR}${encodeURIComponent(handle)}`
}

export function parseRuntimeTerminalPtyId(ptyId: string): RuntimeTerminalPtyIdParts | null {
  if (!ptyId.startsWith(RUNTIME_TERMINAL_PTY_ID_PREFIX)) {
    return null
  }
  const rest = ptyId.slice(RUNTIME_TERMINAL_PTY_ID_PREFIX.length)
  const separatorIndex = rest.indexOf(RUNTIME_TERMINAL_OWNER_SEPARATOR)
  let parts: RuntimeTerminalPtyIdParts
  try {
    parts =
      separatorIndex === -1
        ? { environmentId: null, handle: decodeURIComponent(rest) }
        : {
            environmentId: decodeURIComponent(rest.slice(0, separatorIndex)),
            handle: decodeURIComponent(
              rest.slice(separatorIndex + RUNTIME_TERMINAL_OWNER_SEPARATOR.length)
            )
          }
  } catch {
    return null
  }
  if (
    !isCanonicalPart(parts.handle) ||
    (parts.environmentId !== null && !isCanonicalPart(parts.environmentId))
  ) {
    return null
  }
  const canonicalPtyId =
    parts.environmentId === null
      ? toRuntimeTerminalPtyId(parts.handle)
      : toRuntimeTerminalPtyId(parts.handle, parts.environmentId)
  return canonicalPtyId === ptyId ? parts : null
}

export function isRuntimeTerminalPtyId(ptyId: string | null | undefined): ptyId is string {
  return typeof ptyId === 'string' && parseRuntimeTerminalPtyId(ptyId) !== null
}

export function getRuntimeTerminalHandle(ptyId: string): string | null {
  return parseRuntimeTerminalPtyId(ptyId)?.handle ?? null
}

export function getRuntimeTerminalEnvironmentId(ptyId: string): string | null {
  return parseRuntimeTerminalPtyId(ptyId)?.environmentId ?? null
}
