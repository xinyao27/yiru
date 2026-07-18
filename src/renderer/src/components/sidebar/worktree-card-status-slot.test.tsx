import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { WorktreeCardStatusSlot } from './worktree-card-status-slot'
import type { WorktreeCardPrDisplay } from './worktree-card-pr-display'

const mocks = vi.hoisted(() => ({ status: 'active' }))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <>{render ?? children}</>
  )
}))

vi.mock('./use-worktree-activity-status', () => ({
  useWorktreeActivityStatus: () => mocks.status
}))

const review: WorktreeCardPrDisplay = {
  provider: 'github',
  number: 123,
  title: 'Review me',
  state: 'open',
  status: 'failure'
}
const gitlabReview: WorktreeCardPrDisplay = {
  provider: 'gitlab',
  number: 456,
  title: 'Review me',
  state: 'open',
  status: 'pending'
}

function renderSlot({
  showStatus = true,
  isUnread = false,
  prDisplay = null,
  hasBranchIdentity = false,
  branchIdentityLabel
}: {
  showStatus?: boolean
  isUnread?: boolean
  prDisplay?: WorktreeCardPrDisplay | null
  hasBranchIdentity?: boolean
  branchIdentityLabel?: string
} = {}): string {
  return renderToStaticMarkup(
    <WorktreeCardStatusSlot
      worktreeId="wt-1"
      showStatus={showStatus}
      isUnread={isUnread}
      prDisplay={prDisplay}
      hasBranchIdentity={hasBranchIdentity}
      branchIdentityLabel={branchIdentityLabel}
    />
  )
}

describe('WorktreeCardStatusSlot', () => {
  beforeEach(() => {
    mocks.status = 'active'
  })

  it('reports unread status without a standalone read control', () => {
    const markup = renderSlot({ isUnread: true })

    expect(markup).toContain('Active · Unread')
    expect(markup).toContain('data-worktree-unread-alert=""')
    expect(markup).not.toContain('button')
  })

  it.each([
    ['working', 'Working · Unread'],
    ['permission', 'Needs permission · Unread']
  ])('keeps %s activity ahead of the unread overlay', (status, label) => {
    mocks.status = status
    const markup = renderSlot({ isUnread: true })

    expect(markup).toContain(label)
    expect(markup).not.toContain('data-worktree-unread-alert=""')
  })

  it.each(['active', 'done', 'inactive'])('prioritizes review status over %s status', (status) => {
    mocks.status = status

    expect(renderSlot({ prDisplay: review })).toContain('PR checks: Failed')
  })

  it('uses GitLab MR terminology for review status', () => {
    expect(renderSlot({ prDisplay: gitlabReview })).toContain('MR checks: Pending')
  })

  it('uses branch-only tooltip copy by default', () => {
    const markup = renderSlot({ hasBranchIdentity: true })

    expect(markup).toContain('Branch')
    expect(markup).not.toContain('Branch or folder path')
  })

  it('uses context-aware branch or folder path tooltip copy', () => {
    expect(
      renderSlot({ hasBranchIdentity: true, branchIdentityLabel: 'Branch or folder path' })
    ).toContain('Branch or folder path')
  })

  it('uses active status when the row has no branch identity', () => {
    expect(renderSlot()).toContain('Active')
  })

  it.each([
    ['working', 'Working'],
    ['permission', 'Needs permission']
  ])('keeps %s activity ahead of review status', (status, label) => {
    mocks.status = status
    const markup = renderSlot({ prDisplay: review })

    expect(markup).toContain(label)
    expect(markup).not.toContain('PR checks: Failed')
  })

  it('reports unread review status', () => {
    expect(renderSlot({ isUnread: true, prDisplay: review })).toContain(
      'PR checks: Failed · Unread'
    )
  })

  it('reports unread branch status', () => {
    expect(renderSlot({ isUnread: true, hasBranchIdentity: true })).toContain('Branch · Unread')
  })

  it('renders nothing when status is hidden', () => {
    expect(renderSlot({ showStatus: false })).toBe('')
  })
})
