// Why: runtime payloads arrive as unknown JSON, so every stats parser narrows
// through one guard instead of casting a wire object into a typed field.
export function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? Object.fromEntries(Object.entries(value))
    : null
}
