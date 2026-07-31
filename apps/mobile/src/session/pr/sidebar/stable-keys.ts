// Content-derived React keys for the lists parsed out of markdown bodies and CI
// payloads. Why: array-index keys re-associate per-row state — an open <details>,
// a mounted Mermaid WebView, a scrolled log tail — with the wrong row as soon as
// an item is inserted or removed above it.
export function toStableKeys(parts: readonly string[]): string[] {
  const seen = new Map<string, number>()
  return parts.map((part) => {
    const occurrence = seen.get(part) ?? 0
    seen.set(part, occurrence + 1)
    return occurrence === 0 ? part : `${part}#${occurrence}`
  })
}
