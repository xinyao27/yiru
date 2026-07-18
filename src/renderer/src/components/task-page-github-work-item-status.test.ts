import { describe, expect, it, vi } from 'vite-plus/test'
import {
  getTaskPageGitHubWorkItemStateLabel,
  isTaskPageGitHubDraftPR
} from './task-page-github-work-item-status'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

describe('task-page-github-work-item-status', () => {
  it('maps PR states to labels', () => {
    expect(getTaskPageGitHubWorkItemStateLabel({ type: 'pr', state: 'draft' })).toBe('Draft')
    expect(getTaskPageGitHubWorkItemStateLabel({ type: 'pr', state: 'open' })).toBe('Open')
    expect(getTaskPageGitHubWorkItemStateLabel({ type: 'pr', state: 'closed' })).toBe('Closed')
    expect(getTaskPageGitHubWorkItemStateLabel({ type: 'pr', state: 'merged' })).toBe('Merged')
  })

  it('maps issue states to labels', () => {
    expect(getTaskPageGitHubWorkItemStateLabel({ type: 'issue', state: 'open' })).toBe('Open')
    expect(getTaskPageGitHubWorkItemStateLabel({ type: 'issue', state: 'closed' })).toBe('Closed')
  })

  it('identifies draft pull requests', () => {
    expect(isTaskPageGitHubDraftPR({ type: 'pr', state: 'draft' })).toBe(true)
    expect(isTaskPageGitHubDraftPR({ type: 'pr', state: 'open' })).toBe(false)
  })

  it('handles edge cases gracefully', () => {
    // Issues don't have draft state - should fallback to open styling
    expect(getTaskPageGitHubWorkItemStateLabel({ type: 'issue', state: 'open' })).toBe('Open')
    expect(getTaskPageGitHubWorkItemStateLabel({ type: 'issue', state: 'closed' })).toBe('Closed')

    // Unknown state should fallback to 'Open' for PRs
    expect(getTaskPageGitHubWorkItemStateLabel({ type: 'pr', state: 'unknown' as 'open' })).toBe(
      'Open'
    )

    // Draft PR check
    expect(isTaskPageGitHubDraftPR({ type: 'pr', state: 'draft' })).toBe(true)
    expect(isTaskPageGitHubDraftPR({ type: 'pr', state: 'open' })).toBe(false)
    expect(isTaskPageGitHubDraftPR({ type: 'pr', state: 'merged' })).toBe(false)
    expect(isTaskPageGitHubDraftPR({ type: 'pr', state: 'closed' })).toBe(false)
    expect(isTaskPageGitHubDraftPR({ type: 'issue', state: 'open' })).toBe(false)
    expect(isTaskPageGitHubDraftPR({ type: 'issue', state: 'closed' })).toBe(false)
  })
})
