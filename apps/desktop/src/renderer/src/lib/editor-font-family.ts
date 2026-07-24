export function buildEditorFontFamily(fontFamily: string | null | undefined): string {
  const configuredFamily = fontFamily?.trim()
  // Why: a missing/unavailable user font must stay monospace on every platform
  // instead of falling through to the browser's proportional default.
  return configuredFamily ? `"${configuredFamily}", var(--font-mono)` : 'var(--font-mono)'
}

export type EditorFontFamilySettings = {
  editorFontFamily?: string
  terminalFontFamily?: string
}

/** Keep the existing terminal-font behavior until the editor override is explicitly set. */
export function resolveEditorFontFamily(settings?: EditorFontFamilySettings | null): string {
  return settings?.editorFontFamily?.trim() || settings?.terminalFontFamily || 'monospace'
}

/** Keep the notebook shell's legacy UI-font inheritance when neither code font is set. */
export function resolveEditorFontFamilyOrInherit(
  settings?: EditorFontFamilySettings | null
): string | undefined {
  return settings?.editorFontFamily?.trim() || settings?.terminalFontFamily || undefined
}
