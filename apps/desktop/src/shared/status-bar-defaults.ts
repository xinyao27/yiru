import type { StatusBarItem } from './types'

export const DEFAULT_STATUS_BAR_ITEMS: StatusBarItem[] = [
  'claude',
  'codex',
  'ssh',
  'resource-usage',
  'ports'
]

const LEGACY_DEFAULT_STATUS_BAR_ITEMS: readonly StatusBarItem[] = [
  'claude',
  'codex',
  'gemini',
  'antigravity',
  'opencode-go',
  'kimi',
  'minimax',
  'grok',
  'ssh',
  'resource-usage',
  'ports'
]

// Why: persisted UI state predates the consolidated resource-usage item and
// the quieter provider defaults, so hydration needs one shared normalization.
export function normalizeStatusBarItems(items: readonly string[] | undefined): StatusBarItem[] {
  const source = items ?? DEFAULT_STATUS_BAR_ITEMS
  const normalized: string[] = []
  for (const id of source) {
    const mapped = id === 'memory' || id === 'sessions' ? 'resource-usage' : id
    if (!normalized.includes(mapped)) {
      normalized.push(mapped)
    }
  }

  // Why: provider migrations historically appended in different orders. Match
  // the full former default as a set; partial lists remain user customizations.
  if (
    normalized.length === LEGACY_DEFAULT_STATUS_BAR_ITEMS.length &&
    normalized.every((item) => LEGACY_DEFAULT_STATUS_BAR_ITEMS.includes(item as StatusBarItem))
  ) {
    return [...DEFAULT_STATUS_BAR_ITEMS]
  }
  return normalized as StatusBarItem[]
}
