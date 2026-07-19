import { hasExactSpoolWireKeys } from '../../shared/spool/spool-exact-wire-record'
import {
  SPOOL_RPC_ERROR_CODES,
  type SpoolRpcFailure,
  type SpoolRpcResponse
} from '../../shared/spool/spool-wire-contract'
import type { SpoolSink } from './spool-peer-connection-contract'

export type SpoolPendingPeerRequest = {
  mutation: boolean
  streaming: boolean
  timeout: ReturnType<typeof setTimeout> | null
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  sink?: SpoolSink<unknown>
  signal?: AbortSignal
  abortListener?: () => void
}

export function dispatchSpoolPeerResponse(options: {
  plaintext: string
  ownerRuntimeId: string
  pending: Map<string, SpoolPendingPeerRequest>
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

export function clearPendingTimeout(pending: SpoolPendingPeerRequest): void {
  if (pending.timeout) {
    clearTimeout(pending.timeout)
    pending.timeout = null
  }
}

export function clearPendingRequest(pending: SpoolPendingPeerRequest): void {
  clearPendingTimeout(pending)
  if (pending.signal && pending.abortListener) {
    pending.signal.removeEventListener('abort', pending.abortListener)
  }
}

function parseResponse(plaintext: string): SpoolRpcResponse | null {
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
        !hasExactSpoolWireKeys(record, expectedKeys) ||
        !Object.prototype.hasOwnProperty.call(record, 'result')
      ) {
        return null
      }
      return value as SpoolRpcResponse
    }
    if (
      record.ok !== false ||
      !hasExactSpoolWireKeys(record, ['id', 'ok', 'error', 'ownerRuntimeId']) ||
      !isFailureError(record.error)
    ) {
      return null
    }
    return value as SpoolRpcResponse
  } catch {
    return null
  }
}

const FAILURE_CODES: ReadonlySet<SpoolRpcFailure['error']['code']> = new Set(SPOOL_RPC_ERROR_CODES)

function isFailureError(value: unknown): value is SpoolRpcFailure['error'] {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    hasExactSpoolWireKeys(record, ['code', 'message']) &&
    typeof record.code === 'string' &&
    FAILURE_CODES.has(record.code as SpoolRpcFailure['error']['code']) &&
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
