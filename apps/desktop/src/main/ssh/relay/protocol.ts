// ─── SSH Relay Protocol ─────────────────────────────────────────────
// Constants and error codes specific to the SSH-deployed relay: install
// layout, version handshake, grace period, and the streaming contract.
// The transport-agnostic wire framing lives in
// `~main/channel-multiplexer/frame-codec`.
// See design-ssh-support.md § JSON-RPC Protocol Specification.

import { DEFAULT_SSH_RELAY_GRACE_PERIOD_SECONDS } from '@yiru/runtime-protocol/ssh-connection'

export const RELAY_VERSION = '0.1.0'
export const RELAY_SENTINEL = `YIRU-RELAY v${RELAY_VERSION} READY\n`
export const RELAY_SENTINEL_TIMEOUT_MS = 10_000
export const RELAY_REMOTE_DIR = '.yiru-remote'

/** Reconnection grace period (default, overridable by relay --grace-time). */
export const DEFAULT_GRACE_TIME_MS = DEFAULT_SSH_RELAY_GRACE_PERIOD_SECONDS * 1000

// ── Relay error codes ───────────────────────────────────────────────

export const RelayErrorCode = {
  CommandNotFound: -33001,
  PermissionDenied: -33002,
  PathNotFound: -33003,
  PtyAllocationFailed: -33004,
  DiskFull: -33005,
  TooManyStreams: -33006,
  StreamProtocolError: -33007
} as const

export const JsonRpcErrorCode = {
  MethodNotFound: -32601
} as const

// ── Streaming constants (see docs/relay-file-stream-design.md) ─────

/** Per-chunk payload size for fs.readFileStream. Mirrors VS Code's
 * `bufferSize: 256 * 1024` (vs/platform/files/node/diskFileSystemProvider.ts).
 * 256KB raw → ~340KB base64, well under MAX_MESSAGE_SIZE. */
export const STREAM_CHUNK_SIZE = 256 * 1024

/** Cap on concurrent in-flight streams per relay; mirrors fs.watch's
 * 20-watcher cap idiom. Prevents file-descriptor exhaustion from a buggy
 * client. */
export const MAX_CONCURRENT_STREAMS = 16

// ── Git response streaming (see docs/relay-git-response-stream-design.md) ──

/** Serialized-JSON size above which the relay chunks a streamable git response
 * (diff family + exec) onto the bulk lane instead of one JSON-RPC frame. Mirror
 * of the relay-side constant; the client only opts in — the relay owns the
 * decision — so this is documentation of the shared contract. */
export const GIT_RESPONSE_STREAM_THRESHOLD = 256 * 1024

/** Per-chunk size (serialized-result UTF-8 bytes) for git response streaming.
 * The client reassembles by concatenation and does not depend on this value,
 * so it stays cross-version safe. */
export const GIT_RESPONSE_CHUNK_SIZE = 128 * 1024

/** Sentinel the relay returns as the RPC result when the real payload streams
 * as git.responseChunk frames. Absent from old relays, so a new client falls
 * back to the plain result they return. */
export type GitResponseStreamMarker = {
  __yiruGitResponseStream: { streamId: number; totalBytes: number; chunkCount: number }
}

export function isGitResponseStreamMarker(value: unknown): value is GitResponseStreamMarker {
  if (typeof value !== 'object' || value === null || !('__yiruGitResponseStream' in value)) {
    return false
  }
  const marker = (value as { __yiruGitResponseStream?: unknown }).__yiruGitResponseStream
  if (typeof marker !== 'object' || marker === null) {
    return false
  }
  const fields = marker as Record<string, unknown>
  return (
    Number.isInteger(fields.streamId) &&
    (fields.streamId as number) > 0 &&
    Number.isInteger(fields.totalBytes) &&
    (fields.totalBytes as number) >= 0 &&
    Number.isInteger(fields.chunkCount) &&
    (fields.chunkCount as number) >= 0
  )
}

// ── Supported platforms ─────────────────────────────────────────────

export type RelayPlatform =
  | 'linux-x64'
  | 'linux-arm64'
  | 'darwin-x64'
  | 'darwin-arm64'
  | 'win32-x64'
  | 'win32-arm64'

export function parseUnameToRelayPlatform(os: string, arch: string): RelayPlatform | null {
  const normalizedOs = os.toLowerCase().trim()
  const normalizedArch = arch.toLowerCase().trim()

  let relayOs: string | null = null
  if (normalizedOs === 'linux') {
    relayOs = 'linux'
  } else if (normalizedOs === 'darwin') {
    relayOs = 'darwin'
  } else if (
    normalizedOs === 'windows' ||
    normalizedOs === 'win32' ||
    normalizedOs.startsWith('mingw') ||
    normalizedOs.startsWith('msys')
  ) {
    relayOs = 'win32'
  }

  let relayArch: string | null = null
  if (normalizedArch === 'x86_64' || normalizedArch === 'amd64' || normalizedArch === 'x64') {
    relayArch = 'x64'
  } else if (normalizedArch === 'aarch64' || normalizedArch === 'arm64') {
    relayArch = 'arm64'
  }

  if (!relayOs || !relayArch) {
    return null
  }
  return `${relayOs}-${relayArch}` as RelayPlatform
}
