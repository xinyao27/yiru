// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

  it('labels unmatched worktrees with the compact Remote heading', () => {
    act(() => root.render(<SpoolRemoteWorktreesHeader />))

    const heading = container.querySelector('[role="heading"]')
    expect(heading?.getAttribute('aria-level')).toBe('2')
    expect(heading?.textContent).toBe('Remote')
  })
})
