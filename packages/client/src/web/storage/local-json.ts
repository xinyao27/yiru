export function readLocalJson(key: string): unknown {
  const raw = window.localStorage.getItem(key)
  if (raw === null) {
    return undefined
  }
  try {
    const value: unknown = JSON.parse(raw)
    return value
  } catch {
    return undefined
  }
}

export function writeLocalJson(key: string, value: unknown): void {
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue)
  }
  return isJsonRecord(value) && Object.values(value).every(isJsonValue)
}
