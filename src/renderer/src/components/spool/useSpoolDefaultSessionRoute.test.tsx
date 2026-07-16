// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpoolSessionCatalogEntry } from '../../../../shared/spool/spool-catalog-contract'
import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'
import { useSpoolDefaultSessionRoute } from './useSpoolDefaultSessionRoute'

const route: SpoolWorkspaceRoute = {
  desktopRef: 'desktop-one',
  worktreeRef: 'worktree-one',
  connectionEpoch: 3
}
const firstSession: SpoolSessionCatalogEntry = {
  kind: 'agent',
  agent: 'codex',
  sessionRef: 'session-one',
  title: 'First session'
}

function Probe({
  sessions,
  setActiveRoute
}: {
  sessions: readonly SpoolSessionCatalogEntry[]
  setActiveRoute: (nextRoute: SpoolWorkspaceRoute) => void
}): null {
  useSpoolDefaultSessionRoute({ route, sessions, setActiveRoute })
  return null
}

describe('useSpoolDefaultSessionRoute', () => {
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

  it('opens the first tab when a loading catalog later publishes sessions', () => {
    const setActiveRoute = vi.fn()
    act(() => root.render(<Probe sessions={[]} setActiveRoute={setActiveRoute} />))
    expect(setActiveRoute).not.toHaveBeenCalled()

    act(() => root.render(<Probe sessions={[firstSession]} setActiveRoute={setActiveRoute} />))
    expect(setActiveRoute).toHaveBeenCalledWith({
      ...route,
      sessionRef: firstSession.sessionRef
    })

    act(() => root.render(<Probe sessions={[firstSession]} setActiveRoute={setActiveRoute} />))
    expect(setActiveRoute).toHaveBeenCalledOnce()
  })
})
