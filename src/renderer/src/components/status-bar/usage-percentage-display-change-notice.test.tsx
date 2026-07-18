// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { UsagePercentageDisplayChangeNotice } from './usage-percentage-display-change-notice'
import { USAGE_PERCENTAGE_DISPLAY_SETTING_ID } from '../settings/appearance-usage-percentage-search'

const storeState = {
  persistedUIReady: true,
  usagePercentageDisplayChangeNoticeDismissed: false,
  dismissUsagePercentageDisplayChangeNotice: vi.fn(),
  statusBarVisible: true,
  activeModal: 'none' as string,
  openSettingsTarget: vi.fn(),
  openSettingsPage: vi.fn()
}

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof storeState) => unknown) => selector(storeState),
    {
      getState: () => storeState
    }
  )
}))

describe('UsagePercentageDisplayChangeNotice', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.useFakeTimers()
    storeState.persistedUIReady = true
    storeState.usagePercentageDisplayChangeNoticeDismissed = false
    storeState.statusBarVisible = true
    storeState.activeModal = 'none'
    storeState.dismissUsagePercentageDisplayChangeNotice = vi.fn()
    storeState.openSettingsPage = vi.fn()
    storeState.openSettingsTarget = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    // Why: fixed positioning reads getBoundingClientRect; happy-dom needs a
    // non-zero layout box so the portal card is measured and mounted.
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({
          x: 24,
          y: 700,
          top: 700,
          left: 24,
          bottom: 724,
          right: 200,
          width: 176,
          height: 24,
          toJSON: () => ({})
        }) satisfies DOMRect
    })
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    document.querySelectorAll('[role="status"]').forEach((node) => node.remove())
    vi.useRealTimers()
  })

  it('portals the callout above the usage-meter anchor after a short delay', () => {
    act(() => {
      root.render(
        <UsagePercentageDisplayChangeNotice hasVisibleUsageMeters>
          <span>usage-meters</span>
        </UsagePercentageDisplayChangeNotice>
      )
    })

    expect(document.querySelector('[role="status"]')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(1_800)
    })
    const card = document.querySelector<HTMLElement>('[role="status"]')
    expect(card).not.toBeNull()
    expect(card?.parentElement).toBe(document.body)
    expect(document.body.textContent).toContain('Usage now shows % used')
    expect(container.textContent).toContain('usage-meters')
  })

  it('does not open when no usage meters are visible', () => {
    act(() => {
      root.render(
        <UsagePercentageDisplayChangeNotice hasVisibleUsageMeters={false}>
          <span>usage-meters</span>
        </UsagePercentageDisplayChangeNotice>
      )
    })
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(document.querySelector('[role="status"]')).toBeNull()
  })

  it('does not open when the notice was already dismissed', () => {
    storeState.usagePercentageDisplayChangeNoticeDismissed = true
    act(() => {
      root.render(
        <UsagePercentageDisplayChangeNotice hasVisibleUsageMeters>
          <span>usage-meters</span>
        </UsagePercentageDisplayChangeNotice>
      )
    })
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(document.querySelector('[role="status"]')).toBeNull()
  })

  it('does not open while another modal is open', () => {
    storeState.activeModal = 'feature-tips'
    act(() => {
      root.render(
        <UsagePercentageDisplayChangeNotice hasVisibleUsageMeters>
          <span>usage-meters</span>
        </UsagePercentageDisplayChangeNotice>
      )
    })
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(document.querySelector('[role="status"]')).toBeNull()
  })

  it('deep-links to the Usage percentages setting without a search filter', () => {
    const callOrder: string[] = []
    storeState.openSettingsPage = vi.fn(() => {
      callOrder.push('openSettingsPage')
    })
    storeState.openSettingsTarget = vi.fn(() => {
      callOrder.push('openSettingsTarget')
    })
    storeState.dismissUsagePercentageDisplayChangeNotice = vi.fn()

    act(() => {
      root.render(
        <UsagePercentageDisplayChangeNotice hasVisibleUsageMeters>
          <span>usage-meters</span>
        </UsagePercentageDisplayChangeNotice>
      )
    })
    act(() => {
      vi.advanceTimersByTime(1_800)
    })

    const openSettingsButton = Array.from(document.querySelectorAll('[role="status"] button')).find(
      (button) => button.textContent === 'Open Settings'
    )
    expect(openSettingsButton).toBeTruthy()
    act(() => {
      openSettingsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(callOrder).toEqual(['openSettingsPage', 'openSettingsTarget'])
    expect(storeState.openSettingsTarget).toHaveBeenCalledWith({
      pane: 'appearance',
      repoId: null,
      sectionId: USAGE_PERCENTAGE_DISPLAY_SETTING_ID
    })
    expect(storeState.dismissUsagePercentageDisplayChangeNotice).toHaveBeenCalled()
  })

  it('dismisses from the X button', () => {
    openNotice()

    const dismissButton = document.querySelector('[role="status"] button[aria-label="Dismiss"]')
    expect(dismissButton).toBeTruthy()
    act(() => {
      dismissButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(storeState.dismissUsagePercentageDisplayChangeNotice).toHaveBeenCalledTimes(1)
  })

  it('dismisses from Got it', () => {
    openNotice()

    const gotItButton = Array.from(document.querySelectorAll('[role="status"] button')).find(
      (button) => button.textContent === 'Got it'
    )
    expect(gotItButton).toBeTruthy()
    act(() => {
      gotItButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(storeState.dismissUsagePercentageDisplayChangeNotice).toHaveBeenCalledTimes(1)
  })

  it('dismisses on Escape', () => {
    openNotice()

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(storeState.dismissUsagePercentageDisplayChangeNotice).toHaveBeenCalledTimes(1)
  })

  function openNotice(): void {
    act(() => {
      root.render(
        <UsagePercentageDisplayChangeNotice hasVisibleUsageMeters>
          <span>usage-meters</span>
        </UsagePercentageDisplayChangeNotice>
      )
    })
    act(() => {
      vi.advanceTimersByTime(1_800)
    })
    expect(document.querySelector('[role="status"]')).not.toBeNull()
  }
})
