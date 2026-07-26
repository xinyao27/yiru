// Why: protocol 2 adds granted worktree terminal/agent creation and must not
// advertise that capability to peers that only implement the read/control surface.
export const SPOOL_PROTOCOL_VERSION = 2
export const SPOOL_SUPPORTED_PROTOCOL_VERSIONS = [SPOOL_PROTOCOL_VERSION] as const
export const SPOOL_INGRESS_PORT = 52_777
export const SPOOL_PROBE_PATH = '/spool/v1/probe'
export const SPOOL_CONNECT_PATH = '/spool/v1/connect'
export const SPOOL_TICKET_TTL_MS = 30_000
export const SPOOL_MAX_ENCRYPTED_FRAME_BYTES = 8 * 1024 * 1024
// Leaves room for the NaCl nonce/MAC before base64 expands the encrypted frame to 8 MiB.
export const SPOOL_MAX_RPC_PLAINTEXT_BYTES = 6 * 1024 * 1024 - 64

export const SPOOL_RPC_ERROR_CODES = [
  'invalid_argument',
  'method_not_found',
  'outcome_unknown',
  'resource_busy',
  'resource_not_found',
  'resource_unavailable',
  'result_too_large',
  'unauthorized',
  'internal_error'
] as const

export type SpoolRpcErrorCode = (typeof SPOOL_RPC_ERROR_CODES)[number]

export type SpoolOsFamily = 'macos' | 'linux' | 'windows'

export type SpoolProbeRequest = {
  protocolVersions: number[]
  clientPublicKeyB64: string
}

export type SpoolProbeResponse = {
  protocolVersion: number
  ownerRuntimeId: string
  ownerPublicKeyB64: string
  ownerKeyFingerprint: string
  yiruVersion: string
  osFamily: SpoolOsFamily
  ticket: string
  ticketExpiresAt: number
}

export type SpoolRpcRequest = {
  id: string
  method: string
  params?: unknown
}

export type SpoolRpcSuccess<TResult = unknown> = {
  id: string
  ok: true
  result: TResult
  streaming?: true
  ownerRuntimeId: string
}

export type SpoolRpcFailure = {
  id: string
  ok: false
  error: {
    code: SpoolRpcErrorCode
    message: string
  }
  ownerRuntimeId: string
}

export type SpoolRpcResponse<TResult = unknown> = SpoolRpcSuccess<TResult> | SpoolRpcFailure

export type SpoolConnectionState =
  | { status: 'connecting'; connectionEpoch: number }
  | { status: 'connected'; connectionEpoch: number; ownerRuntimeId: string }
  | {
      status: 'disconnected'
      connectionEpoch: number
      reason: 'closed' | 'failed' | 'owner-restarted' | 'stopped'
    }

export type {
  AuthenticatedRpcPrincipal,
  AuthenticatedSpoolPrincipal,
  TailnetPrincipal
} from '../rpc-principal'
