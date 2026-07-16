// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpoolWorktreeSidebarRow } from './spool-sidebar-rows'

vi.mock('@/components/ui/hover-card', () => ({
  HoverCard: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('./SpoolDesktopUsageHoverCard', () => ({
  SpoolDesktopUsageHoverCard: () => null
}))

import { SpoolWorktreeRow } from './SpoolWorktreeRow'

function makeRow(overrides: Partial<SpoolWorktreeSidebarRow> = {}): SpoolWorktreeSidebarRow {
  return {
    type: 'spool-worktree',
    kind: 'git',
    key: 'spool-worktree-1',
    desktopRef: 'desktop-1',
    connectionEpoch: 1,
    projectRef: 'project-1',
    projectIdentityKey: null,
    worktreeRef: 'worktree-1',
    shareEpoch: 'share-1',
    desktop: {
      userDisplayName: 'Yifeng Wang',
      nodeDisplayName: 'remote-mac',
      connectionStatus: 'connected',
      quota: []
    },
    name: 'main',
    branch: 'main',
    expanded: false,
    active: false,
    sessionCount: 0,
    sessionCatalogStatus: 'complete',
    ...overrides
  }
}

describe('SpoolWorktreeRow', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('keeps the title and metadata on the same content axis as local worktrees', () => {
    act(() => {
      root.render(<SpoolWorktreeRow row={makeRow()} onToggle={vi.fn()} onSelect={vi.fn()} />)
    })

    const statusSlot = container.querySelector('[data-spool-worktree-status-slot]')
    const content = container.querySelector('[data-spool-worktree-content]')

    expect(statusSlot?.querySelector('.lucide-cloud')).not.toBeNull()
    expect(content?.textContent).toContain('Yifeng Wang')
    expect(content?.textContent).toContain('main')
    expect(statusSlot?.textContent).not.toContain('main')
  })

  it('uses the remote icon for folder worktrees too', () => {
    act(() => {
      root.render(
        <SpoolWorktreeRow
          row={makeRow({ kind: 'folder', branch: null })}
          onToggle={vi.fn()}
          onSelect={vi.fn()}
        />
      )
    })

    expect(container.querySelector('.lucide-cloud')).not.toBeNull()
  })
})
