import { RuntimeClientError } from './runtime-client-error'

export function providerParams(value: unknown): Record<string, unknown> {
  if (!isProviderParams(value)) {
    throw new RuntimeClientError('invalid_argument', 'computer-use parameters must be an object')
  }
  return value
}

function isProviderParams(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function stringParam(params: Record<string, unknown>, key: string): string {
  const value = params[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new RuntimeClientError('invalid_argument', `missing ${key}`)
  }
  return value
}

export function optionalStringParam(
  params: Record<string, unknown>,
  key: string
): string | undefined {
  const value = params[key]
  return typeof value === 'string' ? value : undefined
}

export function optionalNumberParam(
  params: Record<string, unknown>,
  key: string
): number | undefined {
  const value = params[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
