// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { Repo } from '../../../../shared/types'
import { RepositoryIconPicker } from './repository-icon-picker'

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: vi.fn(),
  getActiveRuntimeTarget: () => ({ kind: 'local' })
}))

vi.mock('./repository-icon-color-section', () => ({
  RepositoryIconColorSection: () => null
}))

vi.mock('./repository-icon-tabs', () => ({
  RepositoryIconTabs: () => null
}))

const apiMocks = {
  repoSlug: vi.fn(),
  repoUpstream: vi.fn()
}

let container: HTMLDivElement
let root: Root

// @ts-expect-error test window mock
globalThis.window = { api: { gh: apiMocks } }

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-1',
    path: '/workspace/yiru',
    displayName: 'yiru',
    badgeColor: '#2563eb',
    addedAt: 1,
    kind: 'git',
    ...overrides
  }
}

async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('RepositoryIconPicker GitHub avatar refresh', () => {
  beforeEach(() => {
    apiMocks.repoSlug.mockReset()
    apiMocks.repoUpstream.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.replaceChildren()
  })

  it('refreshes stale GitHub avatar metadata lazily when repo settings opens', async () => {
    const updateRepo = vi.fn()
    // Non-fork repo (upstream resolved to null) transferred xinyao27 -> parkerrex.
    const repo = makeRepo({
      upstream: null,
      repoIcon: {
        type: 'image',
        src: 'https://github.com/xinyao27.png?size=64',
        source: 'github',
        label: 'xinyao27/yiru'
      }
    })
    apiMocks.repoUpstream.mockResolvedValueOnce(null)
    apiMocks.repoSlug.mockResolvedValueOnce({ owner: 'parkerrex', repo: 'yiru' })

    act(() => {
      root.render(<RepositoryIconPicker repo={repo} updateRepo={updateRepo} />)
    })
    await flushEffects()

    expect(updateRepo).toHaveBeenCalledExactlyOnceWith('repo-1', {
      repoIcon: {
        type: 'image',
        src: 'https://github.com/parkerrex.png?size=64',
        source: 'github',
        label: 'parkerrex/yiru'
      }
    })
  })

  it('does not clobber a fork identity when the live upstream lookup fails offline', async () => {
    const updateRepo = vi.fn()
    // A fork whose avatar tracks its parent org, resolved earlier while online.
    const repo = makeRepo({
      upstream: { owner: 'xinyao27', repo: 'yiru' },
      repoIcon: {
        type: 'image',
        src: 'https://github.com/xinyao27.png?size=64',
        source: 'github',
        label: 'xinyao27/yiru'
      }
    })
    // Offline/unauthed: the parent lookup returns null. The fork's own origin
    // owner must NOT be persisted over the parent identity.
    apiMocks.repoUpstream.mockResolvedValueOnce(null)
    apiMocks.repoSlug.mockResolvedValueOnce({ owner: 'parkerrex', repo: 'yiru' })

    act(() => {
      root.render(<RepositoryIconPicker repo={repo} updateRepo={updateRepo} />)
    })
    await flushEffects()

    expect(updateRepo).not.toHaveBeenCalled()
    expect(apiMocks.repoSlug).not.toHaveBeenCalled()
  })
})
