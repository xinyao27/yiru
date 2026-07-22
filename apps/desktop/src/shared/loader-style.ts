export const THINKING_ORB_LOADER_STYLES = [
  'thinking-orb-working',
  'thinking-orb-searching',
  'thinking-orb-solving',
  'thinking-orb-listening',
  'thinking-orb-composing',
  'thinking-orb-shaping'
] as const

export type ThinkingOrbLoaderStyle = (typeof THINKING_ORB_LOADER_STYLES)[number]

export const LOADER_STYLES = [
  'drawing',
  'code',
  'macos',
  'square',
  'flipbook',
  'escalade',
  ...THINKING_ORB_LOADER_STYLES
] as const

export type LoaderStyle = (typeof LOADER_STYLES)[number]

export const DEFAULT_LOADER_STYLE: LoaderStyle = 'drawing'

const LOADER_STYLE_SET = new Set<LoaderStyle>(LOADER_STYLES)

export function normalizeLoaderStyle(value: unknown): LoaderStyle {
  return LOADER_STYLE_SET.has(value as LoaderStyle) ? (value as LoaderStyle) : DEFAULT_LOADER_STYLE
}
