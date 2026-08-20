// Why: protocol 2 adds granted worktree terminal/agent creation and must not
// advertise that capability to peers that only implement the read/control surface.
export const COWORKING_PROTOCOL_VERSION = 2
export const COWORKING_SUPPORTED_PROTOCOL_VERSIONS = [COWORKING_PROTOCOL_VERSION] as const
export const COWORKING_INGRESS_PORT = 52_777
export const COWORKING_PROBE_PATH = '/coworking/v1/probe'
export const COWORKING_CONNECT_PATH = '/coworking/v1/connect'
export const COWORKING_TICKET_TTL_MS = 30_000
export const COWORKING_MAX_ENCRYPTED_FRAME_BYTES = getCoworkingResourceQuota(
  'worktree',
  'read'
).encryptedFrameMaxBytes
// Leaves room for the NaCl nonce/MAC before base64 expands the encrypted frame to 8 MiB.
export const COWORKING_MAX_RPC_PLAINTEXT_BYTES = 6 * 1024 * 1024 - 64

export const COWORKING_RPC_ERROR_CODES = [
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

export type CoworkingRpcErrorCode = (typeof COWORKING_RPC_ERROR_CODES)[number]

export type CoworkingOsFamily = 'macos' | 'linux' | 'windows'

export type CoworkingProbeRequest = {
  protocolVersions: number[]
  clientPublicKeyB64: string
}

export type CoworkingProbeResponse = {
  protocolVersion: number
  ownerRuntimeId: string
  ownerPublicKeyB64: string
  ownerKeyFingerprint: string
  yiruVersion: string
  osFamily: CoworkingOsFamily
  ticket: string
  ticketExpiresAt: number
}

export type CoworkingRpcRequest = {
  id: string
  method: string
  params?: unknown
}

export type CoworkingRpcSuccess<TResult = unknown> = {
  id: string
  ok: true
  result: TResult
  streaming?: true
  ownerRuntimeId: string
}

export type CoworkingRpcFailure = {
  id: string
  ok: false
  error: {
    code: CoworkingRpcErrorCode
    message: string
  }
  ownerRuntimeId: string
}

export type CoworkingRpcResponse<TResult = unknown> =
  | CoworkingRpcSuccess<TResult>
  | CoworkingRpcFailure

export type CoworkingConnectionState =
  | { status: 'connecting'; connectionEpoch: number }
  | { status: 'connected'; connectionEpoch: number; ownerRuntimeId: string }
  | {
      status: 'disconnected'
      connectionEpoch: number
      reason: 'closed' | 'failed' | 'owner-restarted' | 'stopped'
    }

export type {
  AuthenticatedRpcPrincipal,
  AuthenticatedCoworkingPrincipal,
  TailnetPrincipal
} from '../rpc-principal'
import { getCoworkingResourceQuota } from './resource-limits'
