import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/types'
import {
  buildRepositoryGitHubAvatarUpdate,
  resolveRepositoryGitHubAvatar
} from './repository-icon-github'

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: vi.fn()
}))

const apiMocks = {
  repoSlug: vi.fn(),
  repoUpstream: vi.fn()
}

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

describe('repository GitHub avatar resolution', () => {
  beforeEach(() => {
    apiMocks.repoSlug.mockReset()
    apiMocks.repoUpstream.mockReset()
  })

  it('uses stored upstream by default to avoid unnecessary live checks', async () => {
    const repo = makeRepo({ upstream: { owner: 'xinyao27', repo: 'yiru' } })

    await expect(resolveRepositoryGitHubAvatar({ kind: 'local' }, repo)).resolves.toEqual({
      repoIcon: {
        type: 'image',
        src: 'https://github.com/xinyao27.png?size=64',
        source: 'github',
        label: 'xinyao27/yiru'
      },
      upstream: { owner: 'xinyao27', repo: 'yiru' }
    })

    expect(apiMocks.repoUpstream).not.toHaveBeenCalled()
    expect(apiMocks.repoSlug).not.toHaveBeenCalled()
  })

  it('force-resolves the live origin owner when a non-fork repo was transferred', async () => {
    // Non-fork repo (upstream resolved to null) transferred xinyao27 -> parkerrex.
    // The cached avatar is stale; forceLive must consult the live origin slug.
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

    const resolution = await resolveRepositoryGitHubAvatar({ kind: 'local' }, repo, {
      forceLive: true
    })

    expect(resolution).toEqual({
      repoIcon: {
        type: 'image',
        src: 'https://github.com/parkerrex.png?size=64',
        source: 'github',
        label: 'parkerrex/yiru'
      },
      upstream: null
    })
    expect(apiMocks.repoUpstream).toHaveBeenCalledExactlyOnceWith({
      repoPath: '/workspace/yiru',
      repoId: 'repo-1'
    })
    expect(apiMocks.repoSlug).toHaveBeenCalledExactlyOnceWith({
      repoPath: '/workspace/yiru',
      repoId: 'repo-1'
    })
    // upstream stays null (unchanged); only the avatar advances to the new owner.
    expect(buildRepositoryGitHubAvatarUpdate(repo, resolution)).toEqual({
      repoIcon: {
        type: 'image',
        src: 'https://github.com/parkerrex.png?size=64',
        source: 'github',
        label: 'parkerrex/yiru'
      }
    })
  })

  it('does not clear a GitHub avatar on passive refresh when live slug is unavailable', async () => {
    const repo = makeRepo({
      repoIcon: {
        type: 'image',
        src: 'https://github.com/xinyao27.png?size=64',
        source: 'github',
        label: 'xinyao27/yiru'
      }
    })

    expect(buildRepositoryGitHubAvatarUpdate(repo, { repoIcon: null, upstream: null })).toEqual({
      upstream: null
    })
    expect(
      buildRepositoryGitHubAvatarUpdate(
        repo,
        { repoIcon: null, upstream: null },
        {
          clearMissingIcon: true
        }
      )
    ).toEqual({
      upstream: null,
      repoIcon: null
    })
  })

  it('preserves a known fork identity when the live upstream lookup fails', async () => {
    // A fork whose avatar tracks its parent org. The live upstream probe fails
    // (offline/unauthed → null), which must NOT downgrade to the origin slug.
    const repo = makeRepo({
      upstream: { owner: 'xinyao27', repo: 'yiru' },
      repoIcon: {
        type: 'image',
        src: 'https://github.com/xinyao27.png?size=64',
        source: 'github',
        label: 'xinyao27/yiru'
      }
    })
    apiMocks.repoUpstream.mockResolvedValueOnce(null)
    // The fork's own origin owner — the value we must NOT persist over the parent.
    apiMocks.repoSlug.mockResolvedValueOnce({ owner: 'parkerrex', repo: 'yiru' })

    const resolution = await resolveRepositoryGitHubAvatar({ kind: 'local' }, repo, {
      forceLive: true
    })

    expect(resolution).toEqual({
      repoIcon: {
        type: 'image',
        src: 'https://github.com/xinyao27.png?size=64',
        source: 'github',
        label: 'xinyao27/yiru'
      },
      upstream: { owner: 'xinyao27', repo: 'yiru' }
    })
    // The origin slug must never be consulted once we fall back to the known parent.
    expect(apiMocks.repoSlug).not.toHaveBeenCalled()
    // Nothing changed, so no repo write is produced (no sticky null clobber).
    expect(buildRepositoryGitHubAvatarUpdate(repo, resolution)).toBeNull()
  })
})
