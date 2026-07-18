export function buildEditorFontFamily(fontFamily: string | null | undefined): string {
  const configuredFamily = fontFamily?.trim()
  // Why: a missing/unavailable user font must stay monospace on every platform
  // instead of falling through to the browser's proportional default.
  return configuredFamily ? `"${configuredFamily}", var(--font-mono)` : 'var(--font-mono)'
}
