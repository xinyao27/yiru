import { describe, expect, it } from 'vite-plus/test'
import {
  DEFAULT_WORKTREE_CARD_PROPERTIES,
  TASK_WORKTREE_CARD_PROPERTIES,
  normalizeWorktreeCardProperties
} from './worktree-card-properties'

describe('worktree card properties', () => {
  it('defines the default card properties', () => {
    expect(DEFAULT_WORKTREE_CARD_PROPERTIES).toContain('status')
    expect(DEFAULT_WORKTREE_CARD_PROPERTIES).toContain('inline-agents')
    expect(DEFAULT_WORKTREE_CARD_PROPERTIES).toContain('automation')
    expect(DEFAULT_WORKTREE_CARD_PROPERTIES).not.toContain('branch')
  })

  it('keeps provider-specific task metadata in the default properties', () => {
    expect(DEFAULT_WORKTREE_CARD_PROPERTIES).toEqual(
      expect.arrayContaining(TASK_WORKTREE_CARD_PROPERTIES)
    )
  })

  it('normalizes fixed properties while dropping retired card metadata', () => {
    expect(normalizeWorktreeCardProperties(['ci', 'branch', 'pr', 'automation', 'unread'])).toEqual(
      ['status', 'unread', 'branch', 'automation']
    )
  })
})
