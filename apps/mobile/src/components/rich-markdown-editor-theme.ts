export type MobileRichMarkdownEditorTheme = {
  background: string
  bodyFontSize: number
  bodyLineHeight: number
  border: string
  codeFontSize: number
  colorScheme: 'light' | 'dark'
  foreground: string
  monoFamily: string
  muted: string
  mutedForeground: string
  primary: string
  radiusMedium: number
  radiusSmall: number
  spacing1: number
  spacing2: number
  spacing3: number
  spacing4: number
}

export function buildMobileRichMarkdownEditorThemeInjection(
  theme: MobileRichMarkdownEditorTheme
): string {
  const payload = JSON.stringify(theme).replace(/<\/script/gi, '<\\/script')
  return `window.__yiruRichMarkdown && window.__yiruRichMarkdown.setTheme(${payload});`
}
