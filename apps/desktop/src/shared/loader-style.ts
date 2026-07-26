// Why: ids mirror the thinking-orbs OrbState union so a stored style can be
// handed straight to the orb renderer without a translation table.
export const LOADER_STYLES = [
  'working',
  'searching',
  'solving',
  'listening',
  'composing',
  'shaping'
] as const

export type LoaderStyle = (typeof LOADER_STYLES)[number]

export const DEFAULT_LOADER_STYLE: LoaderStyle = 'working'

const LOADER_STYLE_SET = new Set<LoaderStyle>(LOADER_STYLES)

// Why: settings written while the non-orb loaders still shipped stored ids like
// 'thinking-orb-solving'; stripping the prefix keeps an existing pick alive.
const LEGACY_ORB_PREFIX = 'thinking-orb-'

export function normalizeLoaderStyle(value: unknown): LoaderStyle {
  const candidate =
    typeof value === 'string' && value.startsWith(LEGACY_ORB_PREFIX)
      ? value.slice(LEGACY_ORB_PREFIX.length)
      : value
  return LOADER_STYLE_SET.has(candidate as LoaderStyle)
    ? (candidate as LoaderStyle)
    : DEFAULT_LOADER_STYLE
}
