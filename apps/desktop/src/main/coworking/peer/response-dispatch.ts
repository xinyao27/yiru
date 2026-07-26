import { hasExactCoworkingWireKeys } from '../../../shared/coworking/exact-wire-record'
import {
  COWORKING_RPC_ERROR_CODES,
  type CoworkingRpcFailure,
  type CoworkingRpcResponse
} from '../../../shared/coworking/wire-contract'
import type { CoworkingSink } from './connection-contract'

export type CoworkingPendingPeerRequest = {
  mutation: boolean
  streaming: boolean
  timeout: ReturnType<typeof setTimeout> | null
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  sink?: CoworkingSink<unknown>
  signal?: AbortSignal
  abortListener?: () => void
}

export function dispatchCoworkingPeerResponse(options: {
  plaintext: string
  ownerRuntimeId: string
  pending: Map<string, CoworkingPendingPeerRequest>
  onOwnerMismatch: () => void
  onProtocolViolation: () => void
}): void {
  const response = parseResponse(options.plaintext)
  if (!response) {
    options.onProtocolViolation()
    return
  }
  if (response.ownerRuntimeId !== options.ownerRuntimeId) {
    options.onOwnerMismatch()
    return
  }
  const pending = options.pending.get(response.id)
  if (!pending) {
    return
  }
  if (!response.ok) {
    clearPendingRequest(pending)
    options.pending.delete(response.id)
    callPeerCallback(() => pending.reject(new Error(response.error.message)), options)
    return
  }
  if (pending.streaming) {
    if (response.streaming === true) {
      if (!callPeerCallback(() => pending.sink?.next(response.result), options)) {
        return
      }
      clearPendingTimeout(pending)
      return
    }
    if (response.result !== null) {
      options.onProtocolViolation()
      return
    }
  } else {
    if (response.streaming === true) {
      options.onProtocolViolation()
      return
    }
    pending.resolve(response.result)
  }
  clearPendingRequest(pending)
  options.pending.delete(response.id)
  callPeerCallback(() => pending.sink?.complete(), options)
}

export function clearPendingTimeout(pending: CoworkingPendingPeerRequest): void {
  if (pending.timeout) {
    clearTimeout(pending.timeout)
    pending.timeout = null
  }
}

export function clearPendingRequest(pending: CoworkingPendingPeerRequest): void {
  clearPendingTimeout(pending)
  if (pending.signal && pending.abortListener) {
    pending.signal.removeEventListener('abort', pending.abortListener)
  }
}

function parseResponse(plaintext: string): CoworkingRpcResponse | null {
  try {
    const value = JSON.parse(plaintext) as unknown
    if (!value || typeof value !== 'object') {
      return null
    }
    const record = value as Record<string, unknown>
    if (
      typeof record.id !== 'string' ||
      record.id.length === 0 ||
      record.id.length > 128 ||
      typeof record.ownerRuntimeId !== 'string' ||
      record.ownerRuntimeId.length === 0 ||
      record.ownerRuntimeId.length > 2048
    ) {
      return null
    }
    if (record.ok === true) {
      const expectedKeys =
        record.streaming === true
          ? ['id', 'ok', 'result', 'streaming', 'ownerRuntimeId']
          : ['id', 'ok', 'result', 'ownerRuntimeId']
      if (
        !hasExactCoworkingWireKeys(record, expectedKeys) ||
        !Object.prototype.hasOwnProperty.call(record, 'result')
      ) {
        return null
      }
      return value as CoworkingRpcResponse
    }
    if (
      record.ok !== false ||
      !hasExactCoworkingWireKeys(record, ['id', 'ok', 'error', 'ownerRuntimeId']) ||
      !isFailureError(record.error)
    ) {
      return null
    }
    return value as CoworkingRpcResponse
  } catch {
    return null
  }
}

const FAILURE_CODES: ReadonlySet<CoworkingRpcFailure['error']['code']> = new Set(
  COWORKING_RPC_ERROR_CODES
)

function isFailureError(value: unknown): value is CoworkingRpcFailure['error'] {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    hasExactCoworkingWireKeys(record, ['code', 'message']) &&
    typeof record.code === 'string' &&
    FAILURE_CODES.has(record.code as CoworkingRpcFailure['error']['code']) &&
    typeof record.message === 'string' &&
    record.message.length <= 256
  )
}

function callPeerCallback(
  callback: () => void,
  options: { onProtocolViolation: () => void }
): boolean {
  try {
    callback()
    return true
  } catch {
    // Why: malformed peer data must close only that physical connection, not the main process.
    options.onProtocolViolation()
    return false
  }
}
