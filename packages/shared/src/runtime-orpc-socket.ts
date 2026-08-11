export const RUNTIME_ORPC_SOCKET_PROTOCOL = 'yiru-orpc-socket-v1'
export const RUNTIME_INBOUND_BINARY_STREAM_CAPABILITY = 'runtime-inbound-binary-stream.v1'

export type RuntimeOrpcSocketConnectFrame = {
  protocol: typeof RUNTIME_ORPC_SOCKET_PROTOCOL
  type: 'connect'
  requestId: string
  runtimeId: string
  authToken: string
  capabilities?: readonly string[]
}

export type RuntimeOrpcSocketMessageFrame = {
  protocol: typeof RUNTIME_ORPC_SOCKET_PROTOCOL
  type: 'message'
  encoding: 'text' | 'base64'
  data: string
}

export type RuntimeOrpcSocketBinaryStreamFrame = {
  protocol: typeof RUNTIME_ORPC_SOCKET_PROTOCOL
  type: 'binary-stream'
  streamId: number
  encoding: 'base64'
  data: string
}

export type RuntimeOrpcSocketClientFrame =
  | RuntimeOrpcSocketConnectFrame
  | RuntimeOrpcSocketMessageFrame
  | RuntimeOrpcSocketBinaryStreamFrame

export type RuntimeOrpcSocketReadyFrame = {
  protocol: typeof RUNTIME_ORPC_SOCKET_PROTOCOL
  type: 'ready'
  requestId: string
  runtimeId: string
  capabilities?: readonly string[]
}

export type RuntimeOrpcSocketErrorFrame = {
  protocol: typeof RUNTIME_ORPC_SOCKET_PROTOCOL
  type: 'error'
  requestId: string
  runtimeId: string
  code: string
  message: string
}

export type RuntimeOrpcSocketKeepaliveFrame = {
  protocol: typeof RUNTIME_ORPC_SOCKET_PROTOCOL
  type: 'keepalive'
}

export type RuntimeOrpcSocketServerFrame =
  | RuntimeOrpcSocketReadyFrame
  | RuntimeOrpcSocketErrorFrame
  | RuntimeOrpcSocketKeepaliveFrame
  | RuntimeOrpcSocketMessageFrame

export type RuntimeOrpcSocketFrameParseResult<TFrame> =
  | { kind: 'other' }
  | { kind: 'invalid'; requestId?: string }
  | { kind: 'frame'; frame: TFrame }

export function encodeRuntimeOrpcSocketFrame(
  frame: RuntimeOrpcSocketClientFrame | RuntimeOrpcSocketServerFrame
): string {
  return JSON.stringify(frame)
}

export function parseRuntimeOrpcSocketClientFrame(
  rawFrame: string
): RuntimeOrpcSocketFrameParseResult<RuntimeOrpcSocketClientFrame> {
  const value = parseMarkedFrame(rawFrame)
  if (value.kind !== 'frame') {
    return value
  }
  const frame = value.frame
  if (frame.type === 'connect') {
    const capabilities = parseCapabilities(frame.capabilities)
    return isNonEmptyString(frame.requestId) &&
      isNonEmptyString(frame.runtimeId) &&
      isNonEmptyString(frame.authToken) &&
      capabilities !== null
      ? {
          kind: 'frame',
          frame: {
            protocol: RUNTIME_ORPC_SOCKET_PROTOCOL,
            type: 'connect',
            requestId: frame.requestId,
            runtimeId: frame.runtimeId,
            authToken: frame.authToken,
            ...(capabilities ? { capabilities } : {})
          }
        }
      : invalidFrame(frame)
  }
  if (frame.type === 'binary-stream') {
    return Number.isSafeInteger(frame.streamId) &&
      typeof frame.streamId === 'number' &&
      frame.streamId >= 0 &&
      frame.encoding === 'base64' &&
      typeof frame.data === 'string'
      ? {
          kind: 'frame',
          frame: {
            protocol: RUNTIME_ORPC_SOCKET_PROTOCOL,
            type: 'binary-stream',
            streamId: frame.streamId,
            encoding: 'base64',
            data: frame.data
          }
        }
      : invalidFrame(frame)
  }
  if (frame.type === 'message') {
    return isMessageEncoding(frame.encoding) && typeof frame.data === 'string'
      ? {
          kind: 'frame',
          frame: {
            protocol: RUNTIME_ORPC_SOCKET_PROTOCOL,
            type: 'message',
            encoding: frame.encoding,
            data: frame.data
          }
        }
      : invalidFrame(frame)
  }
  return invalidFrame(frame)
}

export function parseRuntimeOrpcSocketServerFrame(
  rawFrame: string
): RuntimeOrpcSocketFrameParseResult<RuntimeOrpcSocketServerFrame> {
  const value = parseMarkedFrame(rawFrame)
  if (value.kind !== 'frame') {
    return value
  }
  const frame = value.frame
  if (frame.type === 'message') {
    return isMessageEncoding(frame.encoding) && typeof frame.data === 'string'
      ? {
          kind: 'frame',
          frame: {
            protocol: RUNTIME_ORPC_SOCKET_PROTOCOL,
            type: 'message',
            encoding: frame.encoding,
            data: frame.data
          }
        }
      : invalidFrame(frame)
  }
  if (frame.type === 'keepalive') {
    return {
      kind: 'frame',
      frame: { protocol: RUNTIME_ORPC_SOCKET_PROTOCOL, type: 'keepalive' }
    }
  }
  if (frame.type === 'ready') {
    const capabilities = parseCapabilities(frame.capabilities)
    return isNonEmptyString(frame.requestId) &&
      isNonEmptyString(frame.runtimeId) &&
      capabilities !== null
      ? {
          kind: 'frame',
          frame: {
            protocol: RUNTIME_ORPC_SOCKET_PROTOCOL,
            type: 'ready',
            requestId: frame.requestId,
            runtimeId: frame.runtimeId,
            ...(capabilities ? { capabilities } : {})
          }
        }
      : invalidFrame(frame)
  }
  if (frame.type === 'error') {
    return isNonEmptyString(frame.requestId) &&
      isNonEmptyString(frame.runtimeId) &&
      isNonEmptyString(frame.code) &&
      typeof frame.message === 'string'
      ? {
          kind: 'frame',
          frame: {
            protocol: RUNTIME_ORPC_SOCKET_PROTOCOL,
            type: 'error',
            requestId: frame.requestId,
            runtimeId: frame.runtimeId,
            code: frame.code,
            message: frame.message
          }
        }
      : invalidFrame(frame)
  }
  return invalidFrame(frame)
}

function parseCapabilities(value: unknown): readonly string[] | null | undefined {
  if (value === undefined) {
    return undefined
  }
  if (!Array.isArray(value)) {
    return null
  }
  const capabilities: string[] = []
  for (const capability of value) {
    if (!isNonEmptyString(capability)) {
      return null
    }
    capabilities.push(capability)
  }
  return capabilities
}

function parseMarkedFrame(
  rawFrame: string
): RuntimeOrpcSocketFrameParseResult<Record<string, unknown>> {
  let value: unknown
  try {
    value = JSON.parse(rawFrame)
  } catch {
    return { kind: 'other' }
  }
  if (!isRecord(value) || value.protocol !== RUNTIME_ORPC_SOCKET_PROTOCOL) {
    return { kind: 'other' }
  }
  return { kind: 'frame', frame: value }
}

function invalidFrame(frame: Record<string, unknown>): { kind: 'invalid'; requestId?: string } {
  return typeof frame.requestId === 'string'
    ? { kind: 'invalid', requestId: frame.requestId }
    : { kind: 'invalid' }
}

function isMessageEncoding(value: unknown): value is 'text' | 'base64' {
  return value === 'text' || value === 'base64'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
