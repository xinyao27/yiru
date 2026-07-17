// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpoolRemoteDesktop } from '../../../../shared/spool/spool-catalog-contract'
import { useAppStore } from '@/store'
import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'
import { SpoolFilesPane } from './SpoolFilesPane'

const route: SpoolWorkspaceRoute = {
  desktopRef: 'desktop-one',
  worktreeRef: 'worktree-one',
  connectionEpoch: 3
}

const desktop: SpoolRemoteDesktop = {
  desktopRef: route.desktopRef,
  tailnetNodeId: 'node-one',
  userDisplayName: 'Alice',
  nodeDisplayName: 'Alice Mac',
  connectionEpoch: route.connectionEpoch,
  connectionStatus: 'connected',
  catalog: {
    protocolVersion: 1,
    ownerRuntimeId: 'runtime-one',
    catalogRevision: 1,
    quota: [],
    projects: [
      {
        projectRef: 'project-one',
        name: 'Project',
        worktrees: [
          {
            kind: 'git',
            worktreeRef: route.worktreeRef,
            shareEpoch: 'share-one',
            name: 'Worktree',
            branch: 'main',
            sessions: [],
            sessionCatalog: { status: 'complete', nextCursor: null }
          }
        ]
      }
    ]
  }
}

async function flushRender(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

describe('SpoolFilesPane', () => {
  let container: HTMLDivElement
  let root: Root
  let originalApi: Window['api'] | undefined

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    // Why: Base UI checks active animations, which happy-dom does not implement.
    Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
      configurable: true,
      value: () => []
    })
    useAppStore.setState(useAppStore.getInitialState(), true)
    useAppStore.getState().setSpoolRemoteDesktops([desktop])
    useAppStore.getState().setActiveSpoolWorkspaceRoute(route)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    originalApi = window.api
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    Object.defineProperty(window, 'api', { configurable: true, value: originalApi })
    useAppStore.setState(useAppStore.getInitialState(), true)
  })

  it('expands and collapses remote directories in the ordinary explorer tree', async () => {
    const invoke = vi.fn(async (request: { method: string; params: Record<string, unknown> }) => {
      if (request.method !== 'files.list') {
        throw new Error(`Unexpected method: ${request.method}`)
      }
      if (request.params.relativePath === '') {
        return {
          relativePath: '',
          entries: [
            {
              relativePath: 'src',
              name: 'src',
              kind: 'directory',
              size: null,
              modifiedAt: null
            },
            {
              relativePath: 'README.md',
              name: 'README.md',
              kind: 'file',
              size: 10,
              modifiedAt: null
            }
          ],
          truncated: false
        }
      }
      if (request.params.relativePath === 'src') {
        return {
          relativePath: 'src',
          entries: [
            {
              relativePath: 'src/index.ts',
              name: 'index.ts',
              kind: 'file',
              size: 20,
              modifiedAt: null
            }
          ],
          truncated: false
        }
      }
      throw new Error(`Unexpected path: ${String(request.params.relativePath)}`)
    })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        ...originalApi,
        spoolSharing: { ...originalApi?.spoolSharing, invoke }
      } as Window['api']
    })

    await act(async () => {
      root.render(<SpoolFilesPane route={route} supportsDiff />)
    })
    await flushRender()

    const src = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('src')
    )
    expect(src).toBeDefined()
    expect(container.textContent).toContain('README.md')

    click(src!)
    await flushRender()

    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'files.list',
        params: expect.objectContaining({ relativePath: 'src' })
      })
    )
    expect(container.textContent).toContain('README.md')
    expect(container.textContent).toContain('index.ts')

    click(src!)
    expect(container.textContent).toContain('README.md')
    expect(container.textContent).not.toContain('index.ts')
  })
})
