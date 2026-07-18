// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { MobileRelayStatus } from '../../../../shared/mobile-relay-status'
import type { YiruProfileAuthStatus } from '../../../../shared/yiru-profiles'
import { YIRU_GITHUB_RELEASES_URL } from '../../../../shared/yiru-github-repository'
import { MobilePairingConnectionOptions } from './mobile-pairing-connection-options'

type MobileRelayStoreState = {
  yiruProfileAuthStatus: YiruProfileAuthStatus | null
  yiruProfileConnecting: boolean
  connectCurrentYiruProfile: () => Promise<null>
}

const mocks = vi.hoisted(() => ({
  state: {} as MobileRelayStoreState
}))

vi.mock('../../store', () => ({
  useAppStore: (selector: (state: MobileRelayStoreState) => unknown) => selector(mocks.state)
}))

vi.mock('../../i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

describe('MobilePairingConnectionOptions', () => {
  let statusListener: ((status: MobileRelayStatus) => void) | null
  const connect = vi.fn().mockResolvedValue(null)

  beforeEach(() => {
    statusListener = null
    connect.mockClear()
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        mobile: {
          getRelayStatus: vi.fn().mockResolvedValue({ status: 'registered' }),
          onRelayStatusChanged: vi.fn((listener: (status: MobileRelayStatus) => void) => {
            statusListener = listener
            return vi.fn()
          })
        },
        shell: { openUrl: vi.fn().mockResolvedValue(undefined) }
      }
    })
    mocks.state = {
      yiruProfileAuthStatus: {
        activeProfileId: 'profile-1',
        configured: true,
        state: 'local',
        persistence: 'none'
      },
      yiruProfileConnecting: false,
      connectCurrentYiruProfile: connect
    }
  })

  afterEach(() => cleanup())

  it('offers local-only pairing while Relay requires sign-in', async () => {
    const user = userEvent.setup()
    render(<MobilePairingConnectionOptions value="local-only" onChange={vi.fn()} />)

    expect(screen.getByRole('switch', { name: /connect with Yiru Relay/i })).toBeDisabled()
    expect(screen.getByRole('switch', { name: /connect with Yiru Relay/i })).not.toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(connect).toHaveBeenCalledOnce()
  })

  it('selects either automatic fallback or local-only pairing when signed in', async () => {
    mocks.state = {
      yiruProfileAuthStatus: {
        activeProfileId: 'profile-1',
        configured: true,
        state: 'connected',
        persistence: 'encrypted'
      },
      yiruProfileConnecting: false,
      connectCurrentYiruProfile: connect
    }
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<MobilePairingConnectionOptions value="automatic" onChange={onChange} />)

    await waitFor(() => expect(screen.getByText('Ready')).toBeVisible())
    expect(screen.getByRole('switch', { name: /connect with Yiru Relay/i })).toBeChecked()
    await user.click(screen.getByRole('switch', { name: /connect with Yiru Relay/i }))
    expect(onChange).toHaveBeenCalledWith('local-only')
    statusListener?.('standby')
    await waitFor(() => expect(screen.getByText('Available')).toBeVisible())
  })

  it('shows the Relay beta availability inline and opens the neutral mobile builds page', async () => {
    const user = userEvent.setup()
    render(<MobilePairingConnectionOptions value="local-only" onChange={vi.fn()} />)

    expect(screen.getByText('Beta')).toBeVisible()
    expect(screen.getByText('Mobile builds:')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'TestFlight' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Android APK' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'GitHub Releases' }))
    expect(window.api.shell.openUrl).toHaveBeenCalledWith(YIRU_GITHUB_RELEASES_URL)
  })

  it('keeps the compact onboarding choices structurally stable across modes', async () => {
    mocks.state = {
      yiruProfileAuthStatus: {
        activeProfileId: 'profile-1',
        configured: true,
        state: 'connected',
        persistence: 'encrypted'
      },
      yiruProfileConnecting: false,
      connectCurrentYiruProfile: connect
    }
    const props = { compact: true, onChange: vi.fn() }
    const { rerender } = render(<MobilePairingConnectionOptions {...props} value="automatic" />)

    expect(screen.getByRole('switch', { name: /connect with Yiru Relay/i })).toBeChecked()
    expect(screen.getByText(/direct connection when available/i)).toBeVisible()
    expect(screen.queryByText('Ready')).toBeNull()

    rerender(<MobilePairingConnectionOptions {...props} value="local-only" />)
    expect(screen.getByRole('switch', { name: /connect with Yiru Relay/i })).not.toBeChecked()
    expect(screen.getByText(/direct connection when available/i)).toBeVisible()
    expect(screen.queryByText(/without connecting this phone through Yiru Relay/i)).toBeNull()
  })
})
