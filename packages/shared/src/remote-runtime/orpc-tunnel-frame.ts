const ORPC_BINARY_DELIMITER = 0xff
const ORPC_REQUEST = 1
const ORPC_RESPONSE = 2
const ORPC_EVENT = 3
const ORPC_ABORT = 4
const ORPC_NAMESPACE_SEPARATOR = ':'

export type RuntimeOrpcTunnelFrame = string | Uint8Array<ArrayBufferLike>

export type NamespacedRuntimeOrpcRequestFrame = {
  frame: RuntimeOrpcTunnelFrame
  correlationId: string | null
  requestId: string
  type: number
}

export type RoutedRuntimeOrpcResponseFrame = {
  frame: RuntimeOrpcTunnelFrame
  namespace: string
  requestId: string
  isComplete: boolean
}

export function namespaceRuntimeOrpcRequestFrame(
  frame: RuntimeOrpcTunnelFrame,
  namespace: string
): NamespacedRuntimeOrpcRequestFrame | null {
  const decoded = decodeFrame(frame)
  if (!decoded || !isRequestType(decoded.message.t)) {
    return null
  }
  const requestId = decoded.message.i
  decoded.message.i = namespacedRequestId(namespace, requestId)
  return {
    frame: encodeFrame(decoded),
    correlationId: requestCorrelationId(decoded.message),
    requestId,
    type: decoded.message.t ?? ORPC_REQUEST
  }
}

export function routeRuntimeOrpcResponseFrame(
  frame: RuntimeOrpcTunnelFrame
): RoutedRuntimeOrpcResponseFrame | null {
  const decoded = decodeFrame(frame)
  if (!decoded || !isResponseType(decoded.message.t)) {
    return null
  }
  const routedId = splitNamespacedRequestId(decoded.message.i)
  if (!routedId) {
    return null
  }
  decoded.message.i = routedId.requestId
  return {
    frame: encodeFrame(decoded),
    namespace: routedId.namespace,
    requestId: routedId.requestId,
    isComplete: isCompleteResponse(decoded.message)
  }
}

export function encodeRuntimeOrpcAbortFrame(namespace: string, requestId: string): string {
  return JSON.stringify({ i: namespacedRequestId(namespace, requestId), t: ORPC_ABORT })
}

export function encodeRuntimeOrpcUnavailableResponseFrame(
  requestId: string,
  message: string
): string {
  return JSON.stringify({
    i: requestId,
    p: {
      s: 503,
      b: {
        json: {
          defined: false,
          code: 'runtime_unavailable',
          status: 503,
          message
        }
      }
    }
  })
}

type RuntimeOrpcWireMessage = {
  i: string
  t?: number
  p?: unknown
}

type DecodedRuntimeOrpcFrame = {
  message: RuntimeOrpcWireMessage
  binary: Uint8Array<ArrayBufferLike> | null
  wasBinary: boolean
}

function decodeFrame(frame: RuntimeOrpcTunnelFrame): DecodedRuntimeOrpcFrame | null {
  try {
    if (typeof frame === 'string') {
      const message = parseWireMessage(frame)
      return message ? { message, binary: null, wasBinary: false } : null
    }
    const delimiterIndex = frame.indexOf(ORPC_BINARY_DELIMITER)
    const jsonBytes = delimiterIndex === -1 ? frame : frame.subarray(0, delimiterIndex)
    const message = parseWireMessage(new TextDecoder().decode(jsonBytes))
    if (!message) {
      return null
    }
    return {
      message,
      binary: delimiterIndex === -1 ? null : frame.subarray(delimiterIndex + 1),
      wasBinary: true
    }
  } catch {
    return null
  }
}

function encodeFrame(decoded: DecodedRuntimeOrpcFrame): RuntimeOrpcTunnelFrame {
  const json = JSON.stringify(decoded.message)
  if (!decoded.wasBinary) {
    return json
  }
  const jsonBytes = new TextEncoder().encode(json)
  const binary = decoded.binary ?? new Uint8Array()
  const frame = new Uint8Array(jsonBytes.byteLength + 1 + binary.byteLength)
  frame.set(jsonBytes)
  frame[jsonBytes.byteLength] = ORPC_BINARY_DELIMITER
  frame.set(binary, jsonBytes.byteLength + 1)
  return frame
}

function parseWireMessage(value: string): RuntimeOrpcWireMessage | null {
  const parsed: unknown = JSON.parse(value)
  if (!isRecord(parsed) || typeof parsed.i !== 'string' || parsed.i.length === 0) {
    return null
  }
  if (parsed.t !== undefined && typeof parsed.t !== 'number') {
    return null
  }
  return { ...parsed, i: parsed.i, t: parsed.t }
}

function requestCorrelationId(message: RuntimeOrpcWireMessage): string | null {
  const payload = isRecord(message.p) ? message.p : null
  const headers = payload && isRecord(payload.h) ? payload.h : null
  const raw = headers?.[RUNTIME_ORPC_REQUEST_ID_HEADER]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && value.length > 0 ? value : null
}

function isRequestType(type: number | undefined): boolean {
  return type === undefined || type === ORPC_REQUEST || type === ORPC_EVENT || type === ORPC_ABORT
}

function isResponseType(type: number | undefined): boolean {
  return type === undefined || type === ORPC_RESPONSE || type === ORPC_EVENT || type === ORPC_ABORT
}

function isCompleteResponse(message: RuntimeOrpcWireMessage): boolean {
  const type = message.t ?? ORPC_RESPONSE
  if (type === ORPC_ABORT) {
    return true
  }
  if (type === ORPC_EVENT) {
    const payload = isRecord(message.p) ? message.p : null
    return payload?.e === 'done' || payload?.e === 'error'
  }
  const payload = isRecord(message.p) ? message.p : null
  const headers = payload && isRecord(payload.h) ? payload.h : null
  const contentType = headers?.['content-type']
  return !(
    (typeof contentType === 'string' && contentType.includes('text/event-stream')) ||
    (Array.isArray(contentType) &&
      contentType.some((value) => typeof value === 'string' && value.includes('text/event-stream')))
  )
}

function namespacedRequestId(namespace: string, requestId: string): string {
  return `${namespace}${ORPC_NAMESPACE_SEPARATOR}${requestId}`
}

function splitNamespacedRequestId(value: string): { namespace: string; requestId: string } | null {
  const separatorIndex = value.indexOf(ORPC_NAMESPACE_SEPARATOR)
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return null
  }
  return {
    namespace: value.slice(0, separatorIndex),
    requestId: value.slice(separatorIndex + 1)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
import { RUNTIME_ORPC_REQUEST_ID_HEADER } from '@yiru/runtime-protocol/orpc-peer-frame'
