export const RUNTIME_ORPC_CONNECT_PORT_MESSAGE = 'yiru:runtime-orpc-connect'
export const RUNTIME_ORPC_CONNECT_PORT_CHANNEL = 'runtime:orpc-connect-port'

export const RUNTIME_ORPC_PORT_READY_MESSAGE = 'yiru:runtime-orpc-ready'
export const RUNTIME_ORPC_PORT_ERROR_MESSAGE = 'yiru:runtime-orpc-error'

export type RuntimeOrpcConnectTarget =
  | { kind: 'local' }
  | { kind: 'environment'; environmentId: string; timeoutMs?: number }

export type RuntimeOrpcConnectPortRequest = {
  type: typeof RUNTIME_ORPC_CONNECT_PORT_MESSAGE
  target?: RuntimeOrpcConnectTarget
}

export type RuntimeOrpcPortBootstrapMessage =
  | { type: typeof RUNTIME_ORPC_PORT_READY_MESSAGE }
  | {
      type: typeof RUNTIME_ORPC_PORT_ERROR_MESSAGE
      code: 'unsupported' | 'unavailable'
      message: string
    }

export function parseRuntimeOrpcConnectPortRequest(
  value: unknown
): RuntimeOrpcConnectPortRequest | null {
  if (!isRecord(value) || value.type !== RUNTIME_ORPC_CONNECT_PORT_MESSAGE) {
    return null
  }
  const keys = Object.keys(value)
  if (keys.some((key) => key !== 'type' && key !== 'target')) {
    return null
  }
  if (value.target === undefined) {
    return { type: RUNTIME_ORPC_CONNECT_PORT_MESSAGE }
  }
  const target = parseRuntimeOrpcConnectTarget(value.target)
  return target ? { type: RUNTIME_ORPC_CONNECT_PORT_MESSAGE, target } : null
}

export function parseRuntimeOrpcPortBootstrapMessage(
  value: unknown
): RuntimeOrpcPortBootstrapMessage | null {
  if (!isRecord(value)) {
    return null
  }
  if (
    value.type === RUNTIME_ORPC_PORT_READY_MESSAGE &&
    Object.keys(value).every((key) => key === 'type')
  ) {
    return { type: RUNTIME_ORPC_PORT_READY_MESSAGE }
  }
  if (
    value.type !== RUNTIME_ORPC_PORT_ERROR_MESSAGE ||
    (value.code !== 'unsupported' && value.code !== 'unavailable') ||
    typeof value.message !== 'string' ||
    Object.keys(value).some((key) => key !== 'type' && key !== 'code' && key !== 'message')
  ) {
    return null
  }
  return { type: RUNTIME_ORPC_PORT_ERROR_MESSAGE, code: value.code, message: value.message }
}

function parseRuntimeOrpcConnectTarget(value: unknown): RuntimeOrpcConnectTarget | null {
  if (!isRecord(value) || (value.kind !== 'local' && value.kind !== 'environment')) {
    return null
  }
  if (value.kind === 'local') {
    return Object.keys(value).every((key) => key === 'kind') ? { kind: 'local' } : null
  }
  const environmentId = typeof value.environmentId === 'string' ? value.environmentId.trim() : ''
  const timeoutMs = value.timeoutMs
  if (
    !environmentId ||
    (timeoutMs !== undefined &&
      (typeof timeoutMs !== 'number' || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)) ||
    Object.keys(value).some(
      (key) => key !== 'kind' && key !== 'environmentId' && key !== 'timeoutMs'
    )
  ) {
    return null
  }
  return timeoutMs === undefined
    ? { kind: 'environment', environmentId }
    : { kind: 'environment', environmentId, timeoutMs }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
