export function parseHeaders(serialized: string): Record<string, string> {
  const value: unknown = JSON.parse(serialized)
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('browser_headers_invalid')
  }
  const headers = Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
  if (Object.keys(headers).length !== Object.keys(value).length) {
    throw new Error('browser_headers_invalid')
  }
  return headers
}

export function readHeaders(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === 'string' ? [[key, entry]] : []
    )
  )
}

export function readArray(value: unknown, key: string): object[] {
  const nested = typeof value === 'object' && value !== null ? Reflect.get(value, key) : null
  return Array.isArray(nested)
    ? nested.filter((entry): entry is object => typeof entry === 'object' && entry !== null)
    : []
}

export function readStringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : null
}

export function readStringValue(value: object, key: string): string {
  const nested = Reflect.get(value, key)
  return typeof nested === 'string' ? nested : ''
}

export function readNumberValue(value: object, key: string): number {
  const nested = Reflect.get(value, key)
  return typeof nested === 'number' ? nested : 0
}

export function readBooleanValue(value: unknown, key: string): boolean {
  return typeof value === 'object' && value !== null && Reflect.get(value, key) === true
}

export function requiredString(
  input: Record<string, unknown>,
  key: string,
  allowEmpty = false
): string {
  const value = Reflect.get(input, key)
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new Error(`browser_command_value_missing:${key}`)
  }
  return value
}

export function optionalString(input: object, key: string): string | null {
  const value = Reflect.get(input, key)
  return typeof value === 'string' ? value : null
}

export function requiredNumber(input: Record<string, unknown>, key: string): number {
  const value = optionalNumber(input, key)
  if (value === null) {
    throw new Error(`browser_command_value_missing:${key}`)
  }
  return value
}

export function optionalNumber(input: Record<string, unknown>, key: string): number | null {
  const value = Reflect.get(input, key)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
