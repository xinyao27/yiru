export const LOADER_STYLES = ['drawing', 'code', 'macos', 'square', 'flipbook', 'escalade'] as const

export type LoaderStyle = (typeof LOADER_STYLES)[number]

export const DEFAULT_LOADER_STYLE: LoaderStyle = 'drawing'

const LOADER_STYLE_SET = new Set<LoaderStyle>(LOADER_STYLES)

export function normalizeLoaderStyle(value: unknown): LoaderStyle {
  return LOADER_STYLE_SET.has(value as LoaderStyle) ? (value as LoaderStyle) : DEFAULT_LOADER_STYLE
}
