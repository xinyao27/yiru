// @vitest-environment happy-dom

import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { AppState } from '@/store'
import type { YiruProfileAuthStatus, YiruProfileSummary } from '../../../../shared/yiru-profiles'
import { YiruProfileSwitcher } from './yiru-profile-switcher'

const mocks = vi.hoisted(() => ({
  state: {} as Partial<AppState>
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: Partial<AppState>) => unknown) => selector(mocks.state)
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuLabel: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuSub: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuSubContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuSubTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    'aria-label': ariaLabel
  }: {
    children: ReactNode
    'aria-label'?: string
  }) => <button aria-label={ariaLabel}>{children}</button>
}))

vi.mock('./yiru-profile-avatar', () => ({
  YiruProfileAvatar: () => <span data-testid="avatar" />
}))

vi.mock('./yiru-profile-create-dialog', () => ({
  YiruProfileCreateDialog: () => <div data-testid="create-dialog" />
}))

vi.mock('./yiru-profile-management-dialog', () => ({
  YiruProfileManagementDialog: () => <div data-testid="management-dialog" />
}))

vi.mock('./yiru-profile-switch-confirm-dialog', () => ({
  YiruProfileSwitchConfirmDialog: () => <div data-testid="switch-confirm-dialog" />
}))

vi.mock('./yiru-profile-sign-out-confirm-dialog', () => ({
  YiruProfileSignOutConfirmDialog: () => <div data-testid="signout-confirm-dialog" />
}))

vi.mock('./yiru-profile-switch-liveness', () => ({
  getYiruProfileSwitchLiveWorkSummary: () => ({ hasLiveWork: false })
}))

const cloudProfile: YiruProfileSummary = {
  id: 'local-default',
  name: 'Personal',
  avatar: { kind: 'initials', initials: 'P', color: 'neutral' },
  kind: 'cloud-linked',
  createdAt: 1,
  updatedAt: 1,
  lastOpenedAt: 1,
  cloud: {
    cloudProfileId: 'cloud-1',
    userId: 'user-1',
    email: 'nina@example.com',
    activeOrgId: 'org-1',
    activeOrgName: 'Acme',
    linkedAt: 2
  }
}

const localProfile: YiruProfileSummary = {
  id: 'local-default',
  name: 'Personal',
  avatar: { kind: 'initials', initials: 'P', color: 'neutral' },
  kind: 'local',
  createdAt: 1,
  updatedAt: 1,
  lastOpenedAt: 1
}

const connectedAuthStatus: YiruProfileAuthStatus = {
  activeProfileId: 'local-default',
  configured: true,
  state: 'connected',
  persistence: 'encrypted',
  cloud: cloudProfile.cloud,
  organizations: [
    { orgId: 'org-1', name: 'Acme' },
    { orgId: 'org-2', name: 'Globex' }
  ]
}

const unconfiguredAuthStatus: YiruProfileAuthStatus = {
  activeProfileId: 'local-default',
  configured: false,
  state: 'unconfigured',
  persistence: 'none'
}

const signedOutAuthStatus: YiruProfileAuthStatus = {
  activeProfileId: 'local-default',
  configured: true,
  state: 'local',
  persistence: 'none'
}

function baseState(overrides: Partial<AppState>): Partial<AppState> {
  return {
    yiruProfiles: [cloudProfile],
    activeYiruProfileId: 'local-default',
    yiruProfilesLoading: false,
    yiruProfileSwitching: false,
    yiruProfileConnecting: false,
    yiruProfileAuthStatus: connectedAuthStatus,
    yiruProfilesMultiProfileUi: false,
    fetchYiruProfiles: vi.fn(),
    createLocalYiruProfile: vi.fn(),
    createCloudLinkedYiruProfile: vi.fn(),
    connectCurrentYiruProfile: vi.fn(),
    signOutCurrentYiruProfile: vi.fn(),
    selectYiruProfileOrg: vi.fn(),
    switchYiruProfile: vi.fn(),
    ...overrides
  }
}

describe('YiruProfileSwitcher', () => {
  beforeEach(() => {
    mocks.state = baseState({})
  })

  it('renders an account menu without profile management when the flag is off and cloud is configured', () => {
    mocks.state = baseState({ yiruProfilesMultiProfileUi: false })
    const html = renderToStaticMarkup(<YiruProfileSwitcher />)

    expect(html).toContain('aria-label="Account"')
    expect(html).toContain('nina@example.com')
    expect(html).toContain('Acme')
    // Cloud actions stay reachable in the downscoped account menu.
    expect(html).toContain('Sign out')
    expect(html).not.toContain('Reconnect profile')
    // Profile management surfaces are gone.
    expect(html).not.toContain('Manage profiles')
    expect(html).not.toContain('New local profile')
    expect(html).not.toContain('Create profile for org')
    expect(html).not.toContain('data-testid="create-dialog"')
    expect(html).not.toContain('data-testid="management-dialog"')
    expect(html).not.toContain('data-testid="switch-confirm-dialog"')
    // Sign-out remains mounted.
    expect(html).toContain('data-testid="signout-confirm-dialog"')
  })

  it('presents only the sign-in action before an account identity exists', () => {
    mocks.state = baseState({
      yiruProfiles: [localProfile],
      yiruProfileAuthStatus: signedOutAuthStatus,
      yiruProfilesMultiProfileUi: false
    })
    const html = renderToStaticMarkup(<YiruProfileSwitcher />)

    expect(html).toContain('Sign in to Yiru')
    expect(html).not.toContain('Yiru account')
    expect(html).not.toContain('Signed out')
    expect(html).not.toContain('Personal')
    expect(html).not.toContain('>Local<')
  })

  it('gives a reconnect-required account an explicit recovery action', () => {
    mocks.state = baseState({
      yiruProfileAuthStatus: {
        ...connectedAuthStatus,
        state: 'reconnect-required'
      },
      yiruProfilesMultiProfileUi: false
    })
    const html = renderToStaticMarkup(<YiruProfileSwitcher />)

    expect(html).toContain('nina@example.com')
    expect(html).toContain('Sign-in required')
    expect(html).toContain('Sign in again')
  })

  it('names the pending browser authentication step', () => {
    mocks.state = baseState({
      yiruProfiles: [localProfile],
      yiruProfileAuthStatus: signedOutAuthStatus,
      yiruProfileConnecting: true,
      yiruProfilesMultiProfileUi: false
    })
    const html = renderToStaticMarkup(<YiruProfileSwitcher />)

    expect(html).toContain('Waiting for sign-in…')
  })

  it('renders nothing when the flag is off and cloud is unconfigured', () => {
    mocks.state = baseState({
      yiruProfilesMultiProfileUi: false,
      yiruProfileAuthStatus: unconfiguredAuthStatus
    })
    const html = renderToStaticMarkup(<YiruProfileSwitcher />)

    expect(html).toBe('')
  })

  it('renders the full multi-profile menu when the flag is on', () => {
    mocks.state = baseState({ yiruProfilesMultiProfileUi: true })
    const html = renderToStaticMarkup(<YiruProfileSwitcher />)

    expect(html).toContain('aria-label="Switch profile"')
    expect(html).toContain('Manage profiles')
    expect(html).toContain('New local profile')
    expect(html).toContain('Create profile for org')
    expect(html).toContain('data-testid="create-dialog"')
    expect(html).toContain('data-testid="management-dialog"')
    expect(html).toContain('data-testid="switch-confirm-dialog"')
  })
})
