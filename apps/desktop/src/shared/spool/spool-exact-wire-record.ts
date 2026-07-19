export function hasExactSpoolWireKeys(
  record: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  const allowed = new Set(keys)
  const recordKeys = Object.keys(record)
  return recordKeys.length === keys.length && recordKeys.every((key) => allowed.has(key))
}
