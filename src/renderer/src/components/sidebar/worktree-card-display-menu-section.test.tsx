// @vitest-environment happy-dom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { WorktreeCardDisplayMenuSection } from './worktree-card-display-menu-section'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const setWorktreeCardProperties = vi.fn()
let projectGroups: unknown[] = []
let worktreeCardProperties = [
  'status',
  'unread',
  'issue',
  'linear-issue',
  'pr',
  'automation',
  'comment',
  'ports',
  'inline-agents'
]

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ projectGroups, setWorktreeCardProperties, worktreeCardProperties })
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuCheckboxItem: ({
    children,
    checked,
    onCheckedChange
  }: {
    children: ReactNode
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
  }) => (
    <button
      type="button"
      data-checked={checked ? 'true' : 'false'}
      onClick={() => onCheckedChange?.(!checked)}
    >
      {children}
    </button>
  ),
  DropdownMenuSub: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

let root: Root | null = null
let container: HTMLDivElement | null = null

function renderMenu(): void {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(<WorktreeCardDisplayMenuSection preserveWorkspaceBoardOpen={false} />)
  })
}

beforeEach(() => {
  projectGroups = []
  worktreeCardProperties = [
    'status',
    'unread',
    'issue',
    'linear-issue',
    'pr',
    'automation',
    'comment',
    'ports',
    'inline-agents'
  ]
  setWorktreeCardProperties.mockReset()
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  root = null
  container?.remove()
  container = null
  document.body.innerHTML = ''
})

describe('WorktreeCardDisplayMenuSection', () => {
  it('updates visible card properties', () => {
    renderMenu()

    const notesButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Notes'
    )
    expect(notesButton).toBeDefined()

    act(() => {
      notesButton?.click()
    })

    expect(setWorktreeCardProperties).toHaveBeenCalledWith(
      worktreeCardProperties.filter((property) => property !== 'comment')
    )
  })

  it('keeps branch-only copy when project groups are unavailable', () => {
    renderMenu()

    expect(container?.textContent).toContain('Branch name')
    expect(container?.textContent).not.toContain('Branch / folder path')
  })

  it('mentions folder paths when project groups can create folder workspaces', () => {
    projectGroups = [{ id: 'group-1' }]
    renderMenu()

    expect(container?.textContent).toContain('Branch / folder path')
    expect(container?.textContent).not.toContain('Branch name')
  })
})
