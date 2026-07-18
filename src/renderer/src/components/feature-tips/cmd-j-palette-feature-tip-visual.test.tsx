// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { CmdJPaletteFeatureTipVisual } from './cmd-j-palette-feature-tip-visual'

const prefersReducedMotionMock = vi.hoisted(() => vi.fn(() => false))
const shortcutMock = vi.hoisted(() => vi.fn(() => ({ keys: ['⌘', 'J'], doubleTap: false })))
const formatShortcutMock = vi.hoisted(() => vi.fn(() => [{ keys: ['⌘', 'J'], doubleTap: false }]))

vi.mock('@/components/feature-wall/feature-wall-modal-helpers', () => ({
  usePrefersReducedMotion: prefersReducedMotionMock
}))

vi.mock('@/hooks/use-shortcut-label', () => ({
  useShortcutKeyDetails: shortcutMock,
  formatShortcutKeyComboDetails: formatShortcutMock
}))

async function renderVisual(): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(<CmdJPaletteFeatureTipVisual />)
  })

  return { container, root }
}

describe('CmdJPaletteFeatureTipVisual', () => {
  beforeEach(() => {
    prefersReducedMotionMock.mockReturnValue(false)
    shortcutMock.mockReturnValue({ keys: ['⌘', 'J'], doubleTap: false })
    formatShortcutMock.mockReturnValue([{ keys: ['⌘', 'J'], doubleTap: false }])
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('does not schedule animation timers when reduced motion is preferred', async () => {
    prefersReducedMotionMock.mockReturnValue(true)
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout')

    const { root } = await renderVisual()
    await act(async () => {
      root.unmount()
    })

    expect(setTimeoutSpy).not.toHaveBeenCalled()
  })

  it('clears pending timers on unmount', async () => {
    vi.useFakeTimers()
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')

    const { root } = await renderVisual()
    await act(async () => {
      vi.advanceTimersByTime(500)
    })
    await act(async () => {
      root.unmount()
    })

    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it('settles after the one-shot demo instead of looping idle timers', async () => {
    vi.useFakeTimers()

    const { container, root } = await renderVisual()
    await act(async () => {
      vi.runAllTimers()
    })

    expect(container.textContent).toContain('auth')
    expect(container.textContent).toContain('auth-redirect')
    expect(container.textContent).not.toContain('payments-api')
    expect(vi.getTimerCount()).toBe(0)

    await act(async () => {
      root.unmount()
    })
  })

  it('falls back to default per-key chips when the live binding is unassigned', () => {
    shortcutMock.mockReturnValue({ keys: [], doubleTap: false })
    formatShortcutMock.mockReturnValue([{ keys: ['Ctrl', 'Shift', 'J'], doubleTap: false }])

    const html = renderToStaticMarkup(<CmdJPaletteFeatureTipVisual />)

    expect(formatShortcutMock).toHaveBeenCalledWith('worktree.palette')
    expect(html).toContain('Ctrl')
    expect(html).toContain('Shift')
    expect(html).toContain('J')
  })

  it('renders the live binding as separate shortcut key chips with plus separators', () => {
    shortcutMock.mockReturnValue({ keys: ['⌘', 'J'], doubleTap: false })

    const html = renderToStaticMarkup(<CmdJPaletteFeatureTipVisual />)

    expect(html).toContain('⌘')
    expect(html).toContain('J')
    expect(html).toContain('+')
  })

  it('renders double-tap shortcut chips without plus separators', () => {
    shortcutMock.mockReturnValue({ keys: ['⇧', '⇧'], doubleTap: true })

    const html = renderToStaticMarkup(<CmdJPaletteFeatureTipVisual />)

    expect(html).toContain('⇧')
    expect(html).not.toContain('+')
  })
})
