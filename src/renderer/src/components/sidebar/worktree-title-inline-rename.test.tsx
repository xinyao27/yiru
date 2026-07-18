import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vite-plus/test'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  WorktreeTitleInlineRename,
  getWorktreeTitleRenameCommit,
  isWorktreeTitleTruncated
} from './worktree-title-inline-rename'

describe('getWorktreeTitleRenameCommit', () => {
  it('cancels blank or unchanged inline titles', () => {
    expect(getWorktreeTitleRenameCommit('feature/login', '')).toEqual({ kind: 'cancel' })
    expect(getWorktreeTitleRenameCommit('feature/login', '   ')).toEqual({ kind: 'cancel' })
    expect(getWorktreeTitleRenameCommit('feature/login', ' feature/login ')).toEqual({
      kind: 'cancel'
    })
  })

  it('trims and saves changed inline titles', () => {
    expect(getWorktreeTitleRenameCommit('feature/login', ' Login polish ')).toEqual({
      kind: 'save',
      displayName: 'Login polish'
    })
  })
})

describe('WorktreeTitleInlineRename', () => {
  it('treats only actual text overflow as truncation', () => {
    expect(isWorktreeTitleTruncated({ clientWidth: 120, scrollWidth: 120 })).toBe(false)
    expect(isWorktreeTitleTruncated({ clientWidth: 120, scrollWidth: 119 })).toBe(false)
    expect(isWorktreeTitleTruncated({ clientWidth: 120, scrollWidth: 121 })).toBe(true)
  })

  it('renders an accessible inline rename target', () => {
    const markup = renderToStaticMarkup(
      <TooltipProvider>
        <WorktreeTitleInlineRename
          displayName="Feature workspace"
          showUnreadEmphasis
          onRename={vi.fn()}
        />
      </TooltipProvider>
    )

    expect(markup).not.toContain('title="Feature workspace"')
    expect(markup).toContain('tabindex="0"')
    expect(markup).toContain('Unread:')
    expect(markup).toContain('Feature workspace')
  })

  it('does not add unread copy to read titles', () => {
    const markup = renderToStaticMarkup(
      <TooltipProvider>
        <WorktreeTitleInlineRename displayName="Feature workspace" onRename={vi.fn()} />
      </TooltipProvider>
    )

    expect(markup).not.toContain('Unread:')
  })
})
