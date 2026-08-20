export const RUNTIME_LOOPBACK_TARGET_FRAME = 'yiru:runtime-loopback-target:v1'
export const RUNTIME_LOOPBACK_READY_FRAME = 'yiru:runtime-loopback-ready:v1'
export const RUNTIME_LOOPBACK_ERROR_FRAME = 'yiru:runtime-loopback-error:v1'
export const RUNTIME_LOOPBACK_CREDENTIALS_CHANNEL = 'runtime:loopback-credentials'

export type RuntimeLoopbackTarget =
  | { kind: 'local' }
  | { kind: 'environment'; environmentId: string; timeoutMs?: number }

export type RuntimeLoopbackBootstrap =
  | { type: typeof RUNTIME_LOOPBACK_READY_FRAME; runtimeId: string }
  | {
      type: typeof RUNTIME_LOOPBACK_ERROR_FRAME
      code: 'invalid_target' | 'unsupported' | 'unavailable'
      message: string
    }

export function encodeRuntimeLoopbackTarget(target: RuntimeLoopbackTarget): string {
  return JSON.stringify({ type: RUNTIME_LOOPBACK_TARGET_FRAME, target })
}

export function parseRuntimeLoopbackTarget(value: unknown): RuntimeLoopbackTarget | null {
  if (!isRecord(value) || value.type !== RUNTIME_LOOPBACK_TARGET_FRAME || !isRecord(value.target)) {
    return null
  }
  const target = value.target
  if (target.kind === 'local') {
    return Object.keys(target).every((key) => key === 'kind') ? { kind: 'local' } : null
  }
  const environmentId = typeof target.environmentId === 'string' ? target.environmentId.trim() : ''
  const timeoutMs = target.timeoutMs
  if (
    target.kind !== 'environment' ||
    !environmentId ||
    (timeoutMs !== undefined &&
      (typeof timeoutMs !== 'number' || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)) ||
    Object.keys(target).some(
      (key) => key !== 'kind' && key !== 'environmentId' && key !== 'timeoutMs'
    )
  ) {
    return null
  }
  return timeoutMs === undefined
    ? { kind: 'environment', environmentId }
    : { kind: 'environment', environmentId, timeoutMs }
}

export function encodeRuntimeLoopbackReady(runtimeId: string): string {
  return JSON.stringify({ type: RUNTIME_LOOPBACK_READY_FRAME, runtimeId })
}

export function encodeRuntimeLoopbackError(
  code: Extract<RuntimeLoopbackBootstrap, { type: typeof RUNTIME_LOOPBACK_ERROR_FRAME }>['code'],
  message: string
): string {
  return JSON.stringify({ type: RUNTIME_LOOPBACK_ERROR_FRAME, code, message })
}

export function parseRuntimeLoopbackBootstrap(value: unknown): RuntimeLoopbackBootstrap | null {
  if (!isRecord(value)) {
    return null
  }
  if (
    value.type === RUNTIME_LOOPBACK_READY_FRAME &&
    typeof value.runtimeId === 'string' &&
    value.runtimeId.length > 0 &&
    Object.keys(value).every((key) => key === 'type' || key === 'runtimeId')
  ) {
    return { type: RUNTIME_LOOPBACK_READY_FRAME, runtimeId: value.runtimeId }
  }
  if (
    value.type !== RUNTIME_LOOPBACK_ERROR_FRAME ||
    (value.code !== 'invalid_target' &&
      value.code !== 'unsupported' &&
      value.code !== 'unavailable') ||
    typeof value.message !== 'string' ||
    Object.keys(value).some((key) => key !== 'type' && key !== 'code' && key !== 'message')
  ) {
    return null
  }
  return { type: RUNTIME_LOOPBACK_ERROR_FRAME, code: value.code, message: value.message }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
