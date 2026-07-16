// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SpoolRemoteWorktreesHeader } from './SpoolRemoteWorktreesHeader'

describe('SpoolRemoteWorktreesHeader', () => {
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

  it('labels and toggles unmatched worktrees like a Project header', () => {
    const onToggle = vi.fn()
    act(() => root.render(<SpoolRemoteWorktreesHeader expanded onToggle={onToggle} />))

    const header = container.querySelector<HTMLElement>('[role="button"]')
    expect(header?.getAttribute('aria-expanded')).toBe('true')
    expect(header?.textContent).toBe('Remote')
    expect(header?.querySelector('.lucide-cloudy')).not.toBeNull()

    act(() => header?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(onToggle).toHaveBeenCalledOnce()
  })
})
