export const RUNTIME_ORPC_TEXT_PREFIX = 'yiru-orpc-v1:'
const RUNTIME_ORPC_BINARY_KIND = 0x6f
const RUNTIME_ORPC_BINARY_VERSION = 1
const RUNTIME_ORPC_BINARY_HEADER_BYTES = 2
export const RUNTIME_ORPC_SIDE_CHANNEL_BINARY_KIND = 0x79
export const RUNTIME_ORPC_SIDE_CHANNEL_BINARY_VERSION = 1
export const RUNTIME_ORPC_SIDE_CHANNEL_HEADER_BYTES = 4
const SHELL_SERVICES_ORPC_CONNECT_FRAME = 'yiru-shell-services-v1:connect'
const SHELL_SERVICES_ORPC_TEXT_PREFIX = 'yiru-shell-services-v1:message:'
const SHELL_SERVICES_ORPC_BINARY_KIND = 0x73
const SHELL_SERVICES_ORPC_BINARY_VERSION = 1
const SHELL_SERVICES_ORPC_BINARY_HEADER_BYTES = 2

export const RUNTIME_ORPC_REQUEST_ID_HEADER = 'x-yiru-request-id'
export const RUNTIME_ORPC_BINARY_SIDE_CHANNEL_HEADER = 'x-yiru-binary-side-channel'
export const RUNTIME_ORPC_FEATURE_INTERACTION_SOURCE_HEADER = 'x-yiru-feature-interaction-source'
export const RUNTIME_ORPC_ORCHESTRATION_CAPABILITY_HEADER = 'x-yiru-orchestration-capability'
export const RUNTIME_ORPC_ORCHESTRATION_CONTRACT_VERSION_HEADER =
  'x-yiru-orchestration-contract-version'
export const RUNTIME_ORPC_ORCHESTRATION_REQUEST_ID_HEADER = 'x-yiru-orchestration-request-id'

export function encodeRuntimeOrpcTextFrame(payload: string): string {
  return `${RUNTIME_ORPC_TEXT_PREFIX}${payload}`
}

export function decodeRuntimeOrpcTextFrame(frame: string): string | null {
  return frame.startsWith(RUNTIME_ORPC_TEXT_PREFIX)
    ? frame.slice(RUNTIME_ORPC_TEXT_PREFIX.length)
    : null
}

export function encodeRuntimeOrpcBinaryFrame(
  payload: Uint8Array<ArrayBufferLike>
): Uint8Array<ArrayBuffer> {
  const frame = new Uint8Array(RUNTIME_ORPC_BINARY_HEADER_BYTES + payload.byteLength)
  frame[0] = RUNTIME_ORPC_BINARY_KIND
  frame[1] = RUNTIME_ORPC_BINARY_VERSION
  frame.set(payload, RUNTIME_ORPC_BINARY_HEADER_BYTES)
  return frame
}

export function decodeRuntimeOrpcBinaryFrame(
  frame: Uint8Array<ArrayBufferLike>
): Uint8Array<ArrayBufferLike> | null {
  if (
    frame.byteLength < RUNTIME_ORPC_BINARY_HEADER_BYTES ||
    frame[0] !== RUNTIME_ORPC_BINARY_KIND ||
    frame[1] !== RUNTIME_ORPC_BINARY_VERSION
  ) {
    return null
  }
  return frame.subarray(RUNTIME_ORPC_BINARY_HEADER_BYTES)
}

export function encodeShellServicesOrpcConnectFrame(): string {
  return SHELL_SERVICES_ORPC_CONNECT_FRAME
}

export function isShellServicesOrpcConnectFrame(frame: string): boolean {
  return frame === SHELL_SERVICES_ORPC_CONNECT_FRAME
}

export function encodeShellServicesOrpcTextFrame(payload: string): string {
  return `${SHELL_SERVICES_ORPC_TEXT_PREFIX}${payload}`
}

export function decodeShellServicesOrpcTextFrame(frame: string): string | null {
  return frame.startsWith(SHELL_SERVICES_ORPC_TEXT_PREFIX)
    ? frame.slice(SHELL_SERVICES_ORPC_TEXT_PREFIX.length)
    : null
}

export function encodeShellServicesOrpcBinaryFrame(
  payload: Uint8Array<ArrayBufferLike>
): Uint8Array<ArrayBuffer> {
  const frame = new Uint8Array(SHELL_SERVICES_ORPC_BINARY_HEADER_BYTES + payload.byteLength)
  frame[0] = SHELL_SERVICES_ORPC_BINARY_KIND
  frame[1] = SHELL_SERVICES_ORPC_BINARY_VERSION
  frame.set(payload, SHELL_SERVICES_ORPC_BINARY_HEADER_BYTES)
  return frame
}

export function decodeShellServicesOrpcBinaryFrame(
  frame: Uint8Array<ArrayBufferLike>
): Uint8Array<ArrayBufferLike> | null {
  if (
    frame.byteLength < SHELL_SERVICES_ORPC_BINARY_HEADER_BYTES ||
    frame[0] !== SHELL_SERVICES_ORPC_BINARY_KIND ||
    frame[1] !== SHELL_SERVICES_ORPC_BINARY_VERSION
  ) {
    return null
  }
  return frame.subarray(SHELL_SERVICES_ORPC_BINARY_HEADER_BYTES)
}

export function encodeRuntimeOrpcSideChannelBinaryFrame(
  requestId: string,
  payload: Uint8Array<ArrayBufferLike>
): Uint8Array<ArrayBuffer> {
  const requestIdBytes = new TextEncoder().encode(requestId)
  if (requestIdBytes.byteLength === 0 || requestIdBytes.byteLength > 0xffff) {
    throw new Error('Invalid oRPC side-channel request id')
  }
  const frame = new Uint8Array(
    RUNTIME_ORPC_SIDE_CHANNEL_HEADER_BYTES + requestIdBytes.byteLength + payload.byteLength
  )
  const view = new DataView(frame.buffer)
  frame[0] = RUNTIME_ORPC_SIDE_CHANNEL_BINARY_KIND
  frame[1] = RUNTIME_ORPC_SIDE_CHANNEL_BINARY_VERSION
  view.setUint16(2, requestIdBytes.byteLength, true)
  frame.set(requestIdBytes, RUNTIME_ORPC_SIDE_CHANNEL_HEADER_BYTES)
  frame.set(payload, RUNTIME_ORPC_SIDE_CHANNEL_HEADER_BYTES + requestIdBytes.byteLength)
  return frame
}

export function decodeRuntimeOrpcSideChannelBinaryFrame(
  frame: Uint8Array<ArrayBufferLike>
): { requestId: string; payload: Uint8Array<ArrayBufferLike> } | null {
  if (
    frame.byteLength < RUNTIME_ORPC_SIDE_CHANNEL_HEADER_BYTES ||
    frame[0] !== RUNTIME_ORPC_SIDE_CHANNEL_BINARY_KIND ||
    frame[1] !== RUNTIME_ORPC_SIDE_CHANNEL_BINARY_VERSION
  ) {
    return null
  }
  const requestIdLength = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint16(
    2,
    true
  )
  const payloadOffset = RUNTIME_ORPC_SIDE_CHANNEL_HEADER_BYTES + requestIdLength
  if (requestIdLength === 0 || payloadOffset > frame.byteLength) {
    return null
  }
  const requestId = new TextDecoder().decode(
    frame.subarray(RUNTIME_ORPC_SIDE_CHANNEL_HEADER_BYTES, payloadOffset)
  )
  return requestId ? { requestId, payload: frame.subarray(payloadOffset) } : null
}
