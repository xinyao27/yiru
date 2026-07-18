import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { WorktreeStatus } from '@/lib/worktree-status'
import { WorktreeActivityStatusIndicator } from './worktree-activity-status-indicator'

const mocks = vi.hoisted(() => ({
  status: 'inactive' as WorktreeStatus
}))

vi.mock('./use-worktree-activity-status', () => ({
  useWorktreeActivityStatus: vi.fn(() => mocks.status)
}))

function renderMarkup(status: WorktreeStatus): string {
  mocks.status = status
  return renderToStaticMarkup(
    React.createElement(WorktreeActivityStatusIndicator, { worktreeId: 'wt-child' })
  )
}

describe('WorktreeActivityStatusIndicator', () => {
  beforeEach(() => {
    mocks.status = 'inactive'
  })

  it('renders the shared inactive status for slept worktrees', () => {
    const markup = renderMarkup('inactive')

    expect(markup).toContain('Inactive')
  })

  it('renders the shared active status when the worktree is live', () => {
    const markup = renderMarkup('active')

    expect(markup).toContain('Active')
  })
})
