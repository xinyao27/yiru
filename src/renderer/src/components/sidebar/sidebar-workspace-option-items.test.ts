import { describe, expect, it } from 'vite-plus/test'
import {
  WORKTREE_CARD_PROPERTY_OPTIONS,
  getWorktreeCardPropertyOptions
} from './sidebar-workspace-option-items'

describe('worktree card property options', () => {
  it('exposes provider-specific issue and metadata options', () => {
    const options = getWorktreeCardPropertyOptions()

    expect(WORKTREE_CARD_PROPERTY_OPTIONS).toEqual(options)
    expect(options.map((option) => option.id)).toEqual([
      'issue',
      'linear-issue',
      'comment',
      'automation',
      'ports',
      'inline-agents',
      'branch'
    ])
    expect(options.find((option) => option.id === 'issue')?.properties).toEqual(['issue'])
    expect(options.find((option) => option.id === 'linear-issue')?.properties).toEqual([
      'linear-issue'
    ])
  })

  it('uses branch-only copy without project groups', () => {
    const options = getWorktreeCardPropertyOptions()

    expect(options.find((option) => option.id === 'branch')?.label).toBe('Branch name')
  })

  it('mentions folder paths when project groups are available', () => {
    const options = getWorktreeCardPropertyOptions({ hasProjectGroups: true })

    expect(options.find((option) => option.id === 'branch')?.label).toBe('Branch / folder path')
  })
})
