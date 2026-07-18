import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type {
  GitConflictOperation,
  Repo,
  Worktree,
  WorktreeCardProperty
} from '../../../../shared/types'
import type WorktreeCardComponent from './worktree-card'
import type * as WorkspaceDeleteQuickAction from './workspace-delete-quick-action'

const fetchHostedReviewForBranch = vi.fn()
const fetchIssue = vi.fn()
const openModal = vi.fn()
const updateWorktreeMeta = vi.fn()

let worktreeCardProperties: WorktreeCardProperty[] = ['status']
let tabsByWorktree: Record<string, { id: string }[]> = {}
let ptyIdsByTabId: Record<string, string[]> = {}
let browserTabsByWorktree: Record<string, { id: string }[]> = {}
let workspaceDeleteModifierPressed = false
let gitConflictOperationByWorktree: Record<string, GitConflictOperation> = {}
let WorktreeCard: typeof WorktreeCardComponent

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      deleteStateByWorktreeId: {},
      fetchHostedReviewForBranch,
      fetchIssue,
      gitConflictOperationByWorktree,
      hostedReviewCache: {},
      issueCache: {},
      openModal,
      projectGroups: [],
      remoteBranchConflictByWorktreeId: {},
      settings: null,
      sshConnectionStates: new Map(),
      sshTargetLabels: new Map(),
      browserTabsByWorktree,
      ptyIdsByTabId,
      tabsByWorktree,
      updateWorktreeMeta,
      worktreeCardProperties
    })
}))

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: vi.fn()
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children, render }: { children?: ReactNode; render?: ReactNode }) => (
    <>{render ?? children}</>
  )
}))

vi.mock('./use-worktree-activity-status', () => ({
  useWorktreeActivityStatus: () => 'idle'
}))

vi.mock('./cache-timer', () => ({
  default: () => null,
  usePromptCacheCountdownStartedAt: () => null
}))

vi.mock('./worktree-card-agents', () => ({
  default: () => null
}))

vi.mock('./ssh-disconnected-dialog', () => ({
  SshDisconnectedDialog: () => null
}))

vi.mock('./worktree-context-menu', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
  CLOSE_ALL_CONTEXT_MENUS_EVENT: 'yiru:test-close-context-menus',
  WORKTREE_CONTEXT_MENU_SCOPE_ATTR: 'data-yiru-context-menu-scope',
  WORKTREE_NATIVE_CONTEXT_MENU_ATTR: 'data-worktree-native-context-menu'
}))

vi.mock('./workspace-delete-quick-action', async (importOriginal) => {
  const actual = await importOriginal<typeof WorkspaceDeleteQuickAction>()
  return {
    ...actual,
    useWorkspaceDeleteModifierPressed: () => workspaceDeleteModifierPressed
  }
})

function makeRepo(): Repo {
  return {
    id: 'repo-1',
    path: '/repo',
    displayName: 'yiru',
    badgeColor: '#999999',
    addedAt: 1
  }
}

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'repo-1::/repo/worktrees/quick-action',
    repoId: 'repo-1',
    path: '/repo/worktrees/quick-action',
    displayName: 'Quick action',
    branch: 'quick-action',
    head: 'abc123',
    isBare: false,
    isMainWorktree: false,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: true,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    ...overrides
  }
}

describe('WorktreeCard quick actions', () => {
  beforeAll(async () => {
    WorktreeCard = (await import('./worktree-card')).default
  }, 20_000)

  beforeEach(() => {
    vi.clearAllMocks()
    worktreeCardProperties = ['status']
    tabsByWorktree = {}
    ptyIdsByTabId = {}
    browserTabsByWorktree = {}
    workspaceDeleteModifierPressed = false
    gitConflictOperationByWorktree = {}
  })

  it('renders unread state in the passive status lane', () => {
    const markup = renderToStaticMarkup(
      <WorktreeCard worktree={makeWorktree()} repo={makeRepo()} isActive={false} />
    )

    expect(markup).toContain('data-worktree-unread-alert=""')
    expect(markup).not.toContain('aria-label="Mark as read"')
  })

  it('does not render a pending first-agent rename title badge', () => {
    const markup = renderToStaticMarkup(
      <WorktreeCard
        worktree={makeWorktree({ pendingFirstAgentMessageRename: true })}
        repo={makeRepo()}
        isActive={false}
      />
    )

    expect(markup).not.toMatch(/Will be renamed from first agent message|rename pending/)
    expect(markup).not.toContain(
      'aria-label="This worktree will be renamed from the first agent message"'
    )
    expect(markup).not.toContain('rename pending')
    expect(markup).not.toContain('This worktree will be renamed from the first agent message')
  })

  it('renders the failed first-agent rename title badge', () => {
    const markup = renderToStaticMarkup(
      <WorktreeCard
        worktree={makeWorktree({ firstAgentMessageRenameError: 'model could not name this' })}
        repo={makeRepo()}
        isActive={false}
      />
    )

    expect(markup).toContain('aria-label="Auto-rename failed: view error"')
    expect(markup).toContain('rename failed')
  })

  it('renders the failed first-agent rename title badge when rename is also pending', () => {
    const markup = renderToStaticMarkup(
      <WorktreeCard
        worktree={makeWorktree({
          firstAgentMessageRenameError: 'model could not name this',
          pendingFirstAgentMessageRename: true
        })}
        repo={makeRepo()}
        isActive={false}
      />
    )

    expect(markup).toContain('aria-label="Auto-rename failed: view error"')
    expect(markup).toContain('rename failed')
    expect(markup).not.toContain('rename pending')
  })

  it('renders branch identity when branch is enabled', () => {
    worktreeCardProperties = ['branch']

    const markup = renderToStaticMarkup(
      <WorktreeCard
        worktree={makeWorktree({ displayName: 'quick-action', branch: 'quick-action' })}
        repo={makeRepo()}
        isActive={false}
        hideRepoBadge
      />
    )

    expect(markup).toContain('quick-action')
    expect(markup).toContain('tabindex="0"')
  })

  it('renders detached HEAD identity in card metadata', () => {
    worktreeCardProperties = []

    const markup = renderToStaticMarkup(
      <WorktreeCard
        worktree={makeWorktree({ displayName: 'yiru', branch: '' })}
        repo={makeRepo()}
        isActive={false}
        hideRepoBadge
      />
    )

    expect(markup).toContain('yiru')
    expect(markup).toContain('Detached HEAD @ abc123')
    expect(markup).toContain('Detached HEAD at abc123. You are viewing a commit, not a branch.')
    expect(markup).toContain('tabindex="0"')
  })

  it('hides delete by default for an inactive workspace', () => {
    const markup = renderToStaticMarkup(
      <WorktreeCard worktree={makeWorktree()} repo={makeRepo()} isActive={false} />
    )

    expect(markup).not.toContain('aria-label="Delete workspace"')
  })

  it('shows delete as the top-right quick action while Option/Alt is held', () => {
    workspaceDeleteModifierPressed = true

    const markup = renderToStaticMarkup(
      <WorktreeCard worktree={makeWorktree()} repo={makeRepo()} isActive={false} />
    )

    expect(markup).toContain('aria-label="Delete workspace"')
  })

  it('shows delete as the quick action for folder workspace instances while Option/Alt is held', () => {
    workspaceDeleteModifierPressed = true

    const markup = renderToStaticMarkup(
      <WorktreeCard
        worktree={makeWorktree({
          id: 'repo-1::/repo::workspace:123e4567-e89b-12d3-a456-426614174000',
          path: '/repo',
          isMainWorktree: false
        })}
        repo={{ ...makeRepo(), kind: 'folder' }}
        isActive={false}
      />
    )

    expect(markup).toContain('aria-label="Delete workspace"')
  })

  it('shows delete for a current workspace while Option/Alt is held', () => {
    workspaceDeleteModifierPressed = true
    const worktree = makeWorktree()

    const markup = renderToStaticMarkup(
      <WorktreeCard worktree={worktree} repo={makeRepo()} isActive isCurrentWorktree />
    )

    expect(markup).toContain('aria-label="Delete workspace"')
  })

  it('does not show delete for the main worktree while Option/Alt is held', () => {
    workspaceDeleteModifierPressed = true

    const markup = renderToStaticMarkup(
      <WorktreeCard
        worktree={makeWorktree({ isMainWorktree: true })}
        repo={makeRepo()}
        isActive={false}
      />
    )

    expect(markup).not.toContain('aria-label="Delete workspace"')
  })

  it('does not replace sleep with delete for a workspace with live activity', () => {
    const worktree = makeWorktree()
    tabsByWorktree = { [worktree.id]: [{ id: 'tab-1' }] }
    ptyIdsByTabId = { 'tab-1': ['pty-1'] }

    const markup = renderToStaticMarkup(
      <WorktreeCard worktree={worktree} repo={makeRepo()} isActive={false} />
    )

    expect(markup).not.toContain('aria-label="Sleep workspace"')
    expect(markup).not.toContain('aria-label="Delete workspace"')
  })

  it('does not show sleep as the top-right quick action for an active workspace', () => {
    const worktree = makeWorktree()
    tabsByWorktree = { [worktree.id]: [{ id: 'tab-1' }] }
    ptyIdsByTabId = { 'tab-1': ['pty-1'] }

    const markup = renderToStaticMarkup(
      <WorktreeCard worktree={worktree} repo={makeRepo()} isActive />
    )

    expect(markup).not.toContain('aria-label="Sleep workspace"')
    expect(markup).not.toContain('aria-label="Delete workspace"')
  })

  it('does not show delete when the workspace is current but not selected in the sidebar', () => {
    const worktree = makeWorktree()

    const markup = renderToStaticMarkup(
      <WorktreeCard worktree={worktree} repo={makeRepo()} isActive={false} isCurrentWorktree />
    )

    expect(markup).not.toContain('aria-label="Delete workspace"')
  })

  it('does not show the rebase operation chip on the card', () => {
    const worktree = makeWorktree()
    gitConflictOperationByWorktree = { [worktree.id]: 'rebase' }

    const markup = renderToStaticMarkup(
      <WorktreeCard worktree={worktree} repo={makeRepo()} isActive={false} />
    )

    expect(markup).not.toContain('Rebasing')
  })

  it('keeps non-rebase operation chips on the card', () => {
    const worktree = makeWorktree()
    gitConflictOperationByWorktree = { [worktree.id]: 'merge' }

    const markup = renderToStaticMarkup(
      <WorktreeCard worktree={worktree} repo={makeRepo()} isActive={false} />
    )

    expect(markup).toContain('Merging')
  })
})
