import { describe, expect, it } from 'vite-plus/test'

import { DEFAULT_STATUS_BAR_ITEMS, normalizeStatusBarItems } from './status-bar-defaults'

describe('status bar defaults', () => {
  it('migrates the exact former default to the quieter provider set', () => {
    expect(
      normalizeStatusBarItems([
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
      ])
    ).toEqual(DEFAULT_STATUS_BAR_ITEMS)
  })

  it('recognizes the former default when provider migrations were appended', () => {
    expect(
      normalizeStatusBarItems([
        'claude',
        'codex',
        'gemini',
        'opencode-go',
        'ssh',
        'resource-usage',
        'ports',
        'kimi',
        'minimax',
        'antigravity',
        'grok'
      ])
    ).toEqual(DEFAULT_STATUS_BAR_ITEMS)
  })

  it('preserves customized provider visibility while normalizing legacy status ids', () => {
    expect(normalizeStatusBarItems(['codex', 'gemini', 'memory', 'sessions'])).toEqual([
      'codex',
      'gemini',
      'resource-usage'
    ])
  })
})
