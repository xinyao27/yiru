// @vitest-environment happy-dom

import { act, type ComponentProps, type MouseEventHandler, type PropsWithChildren } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'

const mocks = vi.hoisted(() => ({
  now: 1_000_000_000,
  useResetCountdownClock: vi.fn(() => 1_000_000_000)
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, unknown>) =>
    fallback.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(values?.[key] ?? ''))
}))
vi.mock('@/lib/agent-catalog', () => ({
  AgentIcon: ({ agent }: { agent: string }) => <span data-agent-icon={agent} />
}))
vi.mock('./use-reset-countdown-clock', () => ({
  useResetCountdownClock: mocks.useResetCountdownClock
}))
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({
    children,
    onClick: _onClick,
    ...props
  }: PropsWithChildren<ComponentProps<'div'> & { onClick?: MouseEventHandler }>) => (
    <div {...props}>{children}</div>
  ),
  DropdownMenuSeparator: (props: ComponentProps<'div'>) => <div {...props} />
}))

import { UsageRosterPanel, UsageRow } from './usage-roster-panel'

const signedOutCodex: ProviderRateLimits = {
  provider: 'codex',
  session: null,
  weekly: null,
  updatedAt: 0,
  error: ['ChatGPT authentication', 'required to read rate limits'].join(' '),
  status: 'error'
}

describe('UsageRow', () => {
  it('renders sign-in as row copy instead of nesting an interactive button', () => {
    const markup = renderToStaticMarkup(
      <UsageRow
        provider={signedOutCodex}
        display="used"
        state={{ kind: 'sign-in', statusLabel: 'not signed in' }}
        showSignInAction
        now={mocks.now}
      />
    )

    expect(markup).toContain('not signed in')
    expect(markup).toContain('Sign in')
    expect(markup).not.toContain('<button')
  })

  it('keeps bar fill consistent with the remaining percentage label', () => {
    const markup = renderToStaticMarkup(
      <UsageRow
        provider={{
          ...signedOutCodex,
          session: {
            usedPercent: 25,
            windowMinutes: 300,
            resetsAt: null,
            resetDescription: null
          },
          status: 'ok',
          error: null
        }}
        display="remaining"
        state={{ kind: 'usage', statusLabel: null }}
        showSignInAction={false}
        now={mocks.now}
      />
    )

    expect(markup).toContain('75%')
    expect(markup).toContain('width:75%')
    expect(markup).not.toContain('width:25%')
    expect(markup).toContain('aria-valuetext="75% left"')
    expect(markup).toContain('bg-muted-foreground/40')
  })
})

describe('UsageRosterPanel rows', () => {
  beforeEach(() => mocks.useResetCountdownClock.mockClear())

  it('orders providers by highest usage first', () => {
    const withUsage = (
      provider: ProviderRateLimits['provider'],
      usedPercent: number
    ): ProviderRateLimits => ({
      ...signedOutCodex,
      provider,
      session: {
        usedPercent,
        windowMinutes: 300,
        resetsAt: null,
        resetDescription: null
      },
      status: 'ok',
      error: null
    })
    const markup = renderToStaticMarkup(
      <UsageRosterPanel
        providers={[withUsage('claude', 20), withUsage('codex', 80)]}
        display="used"
        statusBarUsageMode="verbose"
        onStatusBarUsageModeChange={() => {}}
        isRefreshing={false}
        onRefresh={() => {}}
        onOpenProvider={() => {}}
        onSignIn={() => {}}
        canSignIn={() => true}
        onManageAccounts={() => {}}
        onUsageDetails={() => {}}
      />
    )

    expect(markup.indexOf('Codex')).toBeLessThan(markup.indexOf('Claude'))
  })

  it('uses one live clock for all provider reset labels', () => {
    const resetAt = mocks.now + 2 * 60_000
    const markup = renderToStaticMarkup(
      <UsageRosterPanel
        providers={[
          {
            ...signedOutCodex,
            session: {
              usedPercent: 25,
              windowMinutes: 300,
              resetsAt: resetAt,
              resetDescription: null
            },
            status: 'ok',
            error: null
          }
        ]}
        display="used"
        statusBarUsageMode="verbose"
        onStatusBarUsageModeChange={() => {}}
        isRefreshing={false}
        onRefresh={() => {}}
        onOpenProvider={() => {}}
        onSignIn={() => {}}
        canSignIn={() => true}
        onManageAccounts={() => {}}
        onUsageDetails={() => {}}
      />
    )

    expect(mocks.useResetCountdownClock).toHaveBeenCalledOnce()
    expect(mocks.useResetCountdownClock).toHaveBeenCalledWith([resetAt])
    expect(markup).toContain('Resets in 2m')
  })
})

describe('UsageRosterPanel density picker', () => {
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

  function renderPanel(
    statusBarUsageMode: 'verbose' | 'compact',
    onStatusBarUsageModeChange: (mode: 'verbose' | 'compact') => void
  ): void {
    act(() => {
      root.render(
        <UsageRosterPanel
          providers={[]}
          display="used"
          statusBarUsageMode={statusBarUsageMode}
          onStatusBarUsageModeChange={onStatusBarUsageModeChange}
          isRefreshing={false}
          onRefresh={() => {}}
          onOpenProvider={() => {}}
          onSignIn={() => {}}
          canSignIn={() => true}
          onManageAccounts={() => {}}
          onUsageDetails={() => {}}
        />
      )
    })
  }

  function segmentButton(label: string): HTMLButtonElement {
    const button = [...container.querySelectorAll('button')].find(
      (node) => node.textContent === label
    )
    if (!button) {
      throw new Error(`missing "${label}" segment`)
    }
    return button
  }

  it('offers named density options and marks the active one', () => {
    renderPanel('compact', () => {})

    expect(segmentButton('Compact').getAttribute('aria-checked')).toBe('true')
    expect(segmentButton('Detailed').getAttribute('aria-checked')).toBe('false')
  })

  it('switches mode when an option is chosen', () => {
    const onStatusBarUsageModeChange = vi.fn()
    renderPanel('compact', onStatusBarUsageModeChange)

    act(() => segmentButton('Detailed').click())
    expect(onStatusBarUsageModeChange).toHaveBeenLastCalledWith('verbose')
  })
})
