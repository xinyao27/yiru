import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vite-plus/test'
import { getDefaultSettings } from '../../../../shared/constants'
import type { GlobalSettings } from '../../../../shared/types'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mocks.state)
}))

vi.mock('@/hooks/use-sidebar-resize', () => ({
  useSidebarResize: () => ({
    containerRef: { current: null },
    isResizing: false,
    onResizeStart: vi.fn()
  })
}))

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('./sidebar-header', () => ({
  default: () => <div data-testid="sidebar-header" />
}))

vi.mock('./sidebar-nav', () => ({
  default: () => <div data-testid="sidebar-nav" />
}))

vi.mock('./setup-script-prompt-card', () => ({
  default: () => <div data-testid="setup-script-prompt-card" />
}))

vi.mock('./worktree-list', () => ({
  default: () => <div data-testid="worktree-list" />
}))

vi.mock('./sidebar-toolbar', () => ({
  default: () => <div data-testid="sidebar-toolbar" />
}))

vi.mock('./workspace-kanban-drawer', () => ({
  default: ({ statusBarVisible }: { statusBarVisible: boolean }) => (
    <div data-testid="workspace-kanban-drawer" data-status-bar-visible={statusBarVisible} />
  )
}))

vi.mock('./use-sidebar-project-drop', () => ({
  useSidebarProjectDrop: () => ({
    nativeDropTarget: undefined,
    dropHandlers: {},
    affordance: { visible: false }
  })
}))

vi.mock('./use-workspace-board-panel', () => ({
  useWorkspaceBoardPanel: () => ({
    workspaceBoardOpen: false,
    workspaceBoardRenderedOpen: true,
    workspaceBoardDragPreviewOpen: false,
    workspaceBoardMenuOpen: false,
    toggleWorkspaceBoard: vi.fn(),
    handleWorkspaceBoardOpenChange: vi.fn(),
    setWorkspaceBoardMenuOpen: vi.fn(),
    closeWorkspaceBoard: vi.fn(),
    previewWorkspaceBoardFromDrag: vi.fn(),
    solidifyWorkspaceBoardFromDrag: vi.fn(),
    cancelWorkspaceBoardDragPreview: vi.fn()
  })
}))

import Sidebar from './index'

function setSidebarState(settings: GlobalSettings, statusBarVisible = true): void {
  mocks.state = {
    activeModal: null,
    fetchAllWorktrees: vi.fn(),
    repos: [],
    setSidebarWidth: vi.fn(),
    settings,
    sidebarOpen: true,
    sidebarWidth: 320,
    statusBarVisible
  }
}

function renderSidebar(): string {
  return renderToStaticMarkup(
    <Sidebar worktreeScrollOffsetRef={{ current: 0 }} worktreeScrollAnchorRef={{ current: null }} />
  )
}

describe('Sidebar', () => {
  it('passes status bar visibility into the workspace board drawer', () => {
    setSidebarState(getDefaultSettings('/tmp'), false)

    const markup = renderSidebar()

    expect(markup).toContain('data-testid="workspace-kanban-drawer"')
    expect(markup).toContain('data-status-bar-visible="false"')
  })
})
