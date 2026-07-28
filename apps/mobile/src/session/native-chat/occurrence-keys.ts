export function withOccurrenceKeys<T>(
  values: readonly T[],
  identity: (value: T) => string
): { key: string; value: T }[] {
  const occurrences = new Map<string, number>()
  return values.map((value) => {
    const base = identity(value)
    const occurrence = occurrences.get(base) ?? 0
    occurrences.set(base, occurrence + 1)
    return { key: `${base}:${occurrence}`, value }
  })
}
