// Why: the wire-format terminal pty id (`runtime:<handle>` or
// `runtime:<env>@@<handle>`) is parsed by the renderer's attach/subscribe
// paths and MUST be minted in this same shape wherever a host process hands a
// pty id to a client — the desktop main runtime (shell reveal/mount RPCs,
// mobile session snapshots) as well as the renderer itself. Shared here so
// main never re-derives or bypasses the encoding and drifts from the
// renderer's parser (see remote-runtime-pty-transport.ts's `attach`).
const RUNTIME_TERMINAL_PTY_ID_PREFIX = 'runtime:'
const RUNTIME_TERMINAL_OWNER_SEPARATOR = '@@'

export type RuntimeTerminalPtyIdParts = {
  environmentId: string | null
  handle: string
}

export function toRuntimeTerminalPtyId(handle: string, environmentId?: string | null): string {
  const owner = environmentId?.trim()
  if (!owner) {
    return `${RUNTIME_TERMINAL_PTY_ID_PREFIX}${handle}`
  }
  return `${RUNTIME_TERMINAL_PTY_ID_PREFIX}${encodeURIComponent(owner)}${RUNTIME_TERMINAL_OWNER_SEPARATOR}${encodeURIComponent(handle)}`
}

export function parseRuntimeTerminalPtyId(ptyId: string): RuntimeTerminalPtyIdParts | null {
  if (!ptyId.startsWith(RUNTIME_TERMINAL_PTY_ID_PREFIX)) {
    return null
  }
  const rest = ptyId.slice(RUNTIME_TERMINAL_PTY_ID_PREFIX.length)
  const separatorIndex = rest.indexOf(RUNTIME_TERMINAL_OWNER_SEPARATOR)
  if (separatorIndex === -1) {
    return { environmentId: null, handle: rest }
  }
  try {
    return {
      environmentId: decodeURIComponent(rest.slice(0, separatorIndex)),
      handle: decodeURIComponent(
        rest.slice(separatorIndex + RUNTIME_TERMINAL_OWNER_SEPARATOR.length)
      )
    }
  } catch {
    return null
  }
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

// Why: authority checks (does this pane own this pty?) must not accept a
// non-canonical spelling of a handle — `runtime:%66oo` decodes to `foo` and
// would otherwise match the pane that owns `foo`. This rejects anything that
// does not re-encode to exactly the input, plus empty or whitespace-padded
// parts, so callers deciding ownership stay on the strict side of the codec.
export function getCanonicalRuntimeTerminalHandle(ptyId: string): string | null {
  const parts = parseRuntimeTerminalPtyId(ptyId)
  if (!parts) {
    return null
  }
  const { environmentId, handle } = parts
  if (!handle || handle.trim() !== handle) {
    return null
  }
  if (environmentId === null) {
    return `${RUNTIME_TERMINAL_PTY_ID_PREFIX}${handle}` === ptyId ? handle : null
  }
  if (!environmentId || environmentId.trim() !== environmentId) {
    return null
  }
  return toRuntimeTerminalPtyId(handle, environmentId) === ptyId ? handle : null
}
