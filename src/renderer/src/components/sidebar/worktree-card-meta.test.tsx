import { renderToStaticMarkup } from 'react-dom/server'
import type { MouseEventHandler, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { WorktreeCardDetailsHover } from './worktree-card-meta'

vi.mock('@/components/ui/hover-card', () => ({
  HoverCard: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  HoverCardTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <>{render ?? children}</>
  )
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <>{render ?? children}</>
  )
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <>{render ?? children}</>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick
  }: {
    children: ReactNode
    onClick?: MouseEventHandler<HTMLButtonElement>
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  )
}))

describe('WorktreeCardDetailsHover', () => {
  it('offers PR actions through the accessible actions menu', () => {
    const markup = renderToStaticMarkup(
      <WorktreeCardDetailsHover
        issue={null}
        linearIssue={null}
        review={{
          provider: 'github',
          number: 456,
          title: 'Fix stale GH PR',
          state: 'open',
          url: 'https://github.com/acme/yiru/pull/456',
          status: 'success',
          updatedAt: '2026-05-17T00:00:00.000Z',
          mergeable: 'MERGEABLE'
        }}
        comment={null}
        onEditIssue={vi.fn()}
        onEditComment={vi.fn()}
        onOpenReviewInYiru={vi.fn()}
        onUnlinkReview={vi.fn()}
      >
        <span>Linked PR</span>
      </WorktreeCardDetailsHover>
    )

    expect(markup).toContain('aria-label="More PR actions"')
    expect(markup).toContain('More PR actions')
    expect(markup).toContain('Copy link')
    expect(markup).toContain('Unlink PR')
    expect(markup).toContain('aria-label="Open in Yiru"')
    expect(markup).toContain('aria-label="View on GitHub"')
    expect(markup).not.toContain('aria-label="Unlink PR"')
  })

  it('offers issue actions through accessible controls', () => {
    const markup = renderToStaticMarkup(
      <WorktreeCardDetailsHover
        issue={{
          number: 5518,
          title: 'Agent monitor lists ephemeral headless subprocesses',
          state: 'closed',
          url: 'https://github.com/acme/yiru/issues/5518',
          labels: []
        }}
        linearIssue={null}
        review={null}
        comment={null}
        onEditIssue={vi.fn()}
        onEditComment={vi.fn()}
        onOpenGitHubIssueInYiru={vi.fn()}
      >
        <span>Linked issue</span>
      </WorktreeCardDetailsHover>
    )

    expect(markup).toContain('aria-label="More issue actions"')
    expect(markup).toContain('Copy link')
    expect(markup).toContain('aria-label="Edit issue"')
    expect(markup).toContain('aria-label="Open in Yiru"')
    expect(markup).toContain('aria-label="View on GitHub"')
  })

  it('labels GitLab unlink actions with MR terminology', () => {
    const markup = renderToStaticMarkup(
      <WorktreeCardDetailsHover
        issue={null}
        linearIssue={null}
        review={{
          provider: 'gitlab',
          number: 77,
          title: 'Fix GitLab MR display',
          state: 'open',
          url: 'https://gitlab.com/acme/yiru/-/merge_requests/77',
          status: 'success'
        }}
        comment={null}
        onEditIssue={vi.fn()}
        onEditComment={vi.fn()}
        onUnlinkReview={vi.fn()}
      >
        <span>Linked MR</span>
      </WorktreeCardDetailsHover>
    )

    expect(markup).toContain('aria-label="More MR actions"')
    expect(markup).toContain('Unlink MR')
    expect(markup).toContain('View on GitLab')
  })

  it('displays Linear issue details with link', () => {
    const markup = renderToStaticMarkup(
      <WorktreeCardDetailsHover
        issue={null}
        linearIssue={{
          identifier: 'ENG-123',
          title: 'Add Linear ticket display feature',
          url: 'https://linear.app/acme/issue/ENG-123',
          stateName: 'In Progress',
          labels: ['feature', 'ui']
        }}
        review={null}
        comment={null}
        onEditIssue={vi.fn()}
        onEditComment={vi.fn()}
        onOpenLinearIssueInYiru={vi.fn()}
      >
        <span>ENG-123</span>
      </WorktreeCardDetailsHover>
    )

    expect(markup).toContain('ENG-123')
    expect(markup).toContain('Add Linear ticket display feature')
    expect(markup).toContain('https://linear.app/acme/issue/ENG-123')
    expect(markup).toContain('View on Linear')
    expect(markup).toContain('In Progress')
  })

  it('shows identifier when Linear issue URL is unavailable', () => {
    const markup = renderToStaticMarkup(
      <WorktreeCardDetailsHover
        issue={null}
        linearIssue={{
          identifier: 'ENG-123',
          title: 'Loading Linear issue...'
        }}
        review={null}
        comment={null}
        onEditIssue={vi.fn()}
        onEditComment={vi.fn()}
      >
        <span>ENG-123</span>
      </WorktreeCardDetailsHover>
    )

    expect(markup).toContain('ENG-123')
    expect(markup).toContain('Loading Linear issue...')
    expect(markup).not.toContain('View on Linear')
  })

  it('shows link when fallback URL is provided', () => {
    const markup = renderToStaticMarkup(
      <WorktreeCardDetailsHover
        issue={null}
        linearIssue={{
          identifier: 'ENG-123',
          title: 'Loading Linear issue...',
          url: 'https://linear.app/acme/issue/ENG-123'
        }}
        review={null}
        comment={null}
        onEditIssue={vi.fn()}
        onEditComment={vi.fn()}
      >
        <span>ENG-123</span>
      </WorktreeCardDetailsHover>
    )

    expect(markup).toContain('ENG-123')
    expect(markup).toContain('Loading Linear issue...')
    expect(markup).toContain('https://linear.app/acme/issue/ENG-123')
    expect(markup).toContain('View on Linear')
  })
})
