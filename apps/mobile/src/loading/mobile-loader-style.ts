export const MOBILE_LOADER_STYLES = [
  'drawing',
  'code',
  'macos',
  'square',
  'flipbook',
  'escalade'
] as const

export type MobileLoaderStyle = (typeof MOBILE_LOADER_STYLES)[number]

export const DEFAULT_MOBILE_LOADER_STYLE: MobileLoaderStyle = 'drawing'

const MOBILE_LOADER_STYLE_SET = new Set<MobileLoaderStyle>(MOBILE_LOADER_STYLES)

export function normalizeMobileLoaderStyle(value: unknown): MobileLoaderStyle {
  return MOBILE_LOADER_STYLE_SET.has(value as MobileLoaderStyle)
    ? (value as MobileLoaderStyle)
    : DEFAULT_MOBILE_LOADER_STYLE
}

export function getMobileLoaderStyleLabel(style: MobileLoaderStyle): string {
  switch (style) {
    case 'drawing':
      return 'Drawn icons'
    case 'code':
      return 'Code braces'
    case 'macos':
      return 'macOS'
    case 'square':
      return 'Square'
    case 'flipbook':
      return 'Flipbook'
    case 'escalade':
      return 'Escalade'
  }
}
