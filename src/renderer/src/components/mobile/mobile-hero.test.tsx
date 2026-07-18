// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('./network-interface-picker', () => ({
  NetworkInterfacePicker: () => null
}))

vi.mock('../settings/mobile-pairing-connection-options', () => ({
  MobilePairingConnectionOptions: () => null
}))

vi.mock('./windows-firewall-notice', () => ({
  WindowsFirewallNotice: () => null
}))

import { HeroFlow, type StepIndex } from './mobile-hero'
import type { MobilePlatform } from './mobile-release-link'

class MockResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
}

describe('HeroFlow height', () => {
  const originalScrollHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollHeight'
  )

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.textContent?.includes('Step 1 of 2') ? 300 : 520
      }
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    if (originalScrollHeight) {
      Object.defineProperty(HTMLElement.prototype, 'scrollHeight', originalScrollHeight)
    }
  })

  function renderFlow(
    stepIdx: StepIndex,
    platform: MobilePlatform = 'ios',
    onPlatformChange = vi.fn()
  ) {
    return render(
      <HeroFlow
        stepIdx={stepIdx}
        platform={platform}
        onPlatformChange={onPlatformChange}
        installQrUrl={null}
        installCopy={{ ctaLabel: 'Open TestFlight', url: 'https://example.com' }}
        onOpenInstallUrl={vi.fn()}
        onCopyInstallUrl={vi.fn()}
        pairQrDataUrl={null}
        pairingUrl={null}
        pairLoading={false}
        connectionMode="automatic"
        onConnectionModeChange={vi.fn()}
        onRegeneratePairing={vi.fn()}
        onCopyPairingCode={vi.fn()}
        networkInterfaces={[]}
        selectedAddress={undefined}
        onSelectedAddressChange={vi.fn()}
        onRefreshNetworkInterfaces={vi.fn()}
        refreshingNetworkInterfaces={false}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />
    )
  }

  it('switches between the available mobile platforms', async () => {
    const onPlatformChange = vi.fn()
    const user = userEvent.setup()
    renderFlow(0, 'ios', onPlatformChange)

    expect(screen.getByRole('button', { name: 'Open TestFlight' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'iOS' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Android' })).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: 'Android' }))
    expect(onPlatformChange).toHaveBeenCalledWith('android')
  })

  it('marks the inactive step inert when navigation changes', () => {
    const { rerender } = renderFlow(0)
    expect(screen.getByText('Step 2 of 2').closest('[aria-hidden]')).toHaveAttribute('inert')

    rerender(
      <HeroFlow
        stepIdx={1}
        platform="ios"
        onPlatformChange={vi.fn()}
        installQrUrl={null}
        installCopy={{ ctaLabel: 'Open TestFlight', url: 'https://example.com' }}
        onOpenInstallUrl={vi.fn()}
        onCopyInstallUrl={vi.fn()}
        pairQrDataUrl={null}
        pairingUrl={null}
        pairLoading={false}
        connectionMode="automatic"
        onConnectionModeChange={vi.fn()}
        onRegeneratePairing={vi.fn()}
        onCopyPairingCode={vi.fn()}
        networkInterfaces={[]}
        selectedAddress={undefined}
        onSelectedAddressChange={vi.fn()}
        onRefreshNetworkInterfaces={vi.fn()}
        refreshingNetworkInterfaces={false}
        onBack={vi.fn()}
        onContinue={vi.fn()}
      />
    )

    expect(screen.getByText('Step 1 of 2').closest('[aria-hidden]')).toHaveAttribute('inert')
  })
})
