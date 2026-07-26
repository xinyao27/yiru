// Why: ids mirror the expo-thinking-orbs OrbState union so a stored style can be
// handed straight to the orb without a translation table.
export const MOBILE_LOADER_STYLES = [
  'working',
  'searching',
  'solving',
  'listening',
  'composing',
  'shaping'
] as const

export type MobileLoaderStyle = (typeof MOBILE_LOADER_STYLES)[number]

export const DEFAULT_MOBILE_LOADER_STYLE: MobileLoaderStyle = 'working'

const MOBILE_LOADER_STYLE_SET = new Set<MobileLoaderStyle>(MOBILE_LOADER_STYLES)

export function normalizeMobileLoaderStyle(value: unknown): MobileLoaderStyle {
  return MOBILE_LOADER_STYLE_SET.has(value as MobileLoaderStyle)
    ? (value as MobileLoaderStyle)
    : DEFAULT_MOBILE_LOADER_STYLE
}

export function getMobileLoaderStyleLabel(style: MobileLoaderStyle): string {
  switch (style) {
    case 'working':
      return 'Working'
    case 'searching':
      return 'Searching'
    case 'solving':
      return 'Solving'
    case 'listening':
      return 'Listening'
    case 'composing':
      return 'Composing'
    case 'shaping':
      return 'Shaping'
  }
}
