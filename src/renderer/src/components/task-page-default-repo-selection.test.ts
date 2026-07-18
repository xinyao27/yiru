import { describe, expect, it } from 'vite-plus/test'
import type { Repo } from '../../../shared/types'
import {
  getDefaultTaskRepoSelection,
  getTaskProjectPickerGroups,
  getTaskProjectPickerRepos,
  normalizeTaskRepoSelection
} from './task-page-default-repo-selection'

function repo(overrides: Partial<Repo> & Pick<Repo, 'id'>): Repo {
  return {
    path: `/repos/${overrides.id}`,
    displayName: overrides.id,
    badgeColor: '#737373',
    addedAt: 100,
    kind: 'git',
    ...overrides
  }
}

describe('getDefaultTaskRepoSelection', () => {
  it('selects one source per logical GitHub project', () => {
    const selection = getDefaultTaskRepoSelection([
      repo({
        id: 'local-yiru',
        upstream: { owner: 'xinyao27', repo: 'Yiru' }
      }),
      repo({
        id: 'ssh-yiru',
        connectionId: 'builder',
        upstream: { owner: 'xinyao27', repo: 'yiru' }
      }),
      repo({
        id: 'other',
        upstream: { owner: 'xinyao27', repo: 'other' }
      })
    ])

    expect([...selection].sort()).toEqual(['local-yiru', 'other'])
  })

  it('prefers local checkout over a remote checkout for the same project', () => {
    const selection = getDefaultTaskRepoSelection([
      repo({
        id: 'ssh-yiru',
        addedAt: 1,
        connectionId: 'builder',
        upstream: { owner: 'xinyao27', repo: 'yiru' }
      }),
      repo({
        id: 'local-yiru',
        addedAt: 2,
        upstream: { owner: 'xinyao27', repo: 'yiru' }
      })
    ])

    expect([...selection]).toEqual(['local-yiru'])
  })

  it('keeps same-named folders separate when provider identity is missing', () => {
    const selection = getDefaultTaskRepoSelection([
      repo({ id: 'local-app', displayName: 'app' }),
      repo({ id: 'ssh-app', displayName: 'app', connectionId: 'builder' })
    ])

    expect([...selection].sort()).toEqual(['local-app', 'ssh-app'])
  })

  it('uses GitHub repo icon metadata to identify legacy duplicate projects', () => {
    const selection = getDefaultTaskRepoSelection([
      repo({
        id: 'local-claude-swap',
        displayName: 'claude-swap',
        repoIcon: {
          type: 'image',
          src: 'https://github.com/xinyao27.png?size=64',
          source: 'github',
          label: 'xinyao27/claude-swap'
        }
      }),
      repo({
        id: 'ssh-claude-swap',
        displayName: 'claude-swap',
        connectionId: 'builder',
        repoIcon: {
          type: 'image',
          src: 'https://github.com/xinyao27.png?size=64',
          source: 'github',
          label: 'xinyao27/claude-swap'
        }
      })
    ])

    expect([...selection]).toEqual(['local-claude-swap'])
  })
})

describe('getTaskProjectPickerRepos', () => {
  it('shows one picker row per logical GitHub project', () => {
    const pickerRepos = getTaskProjectPickerRepos([
      repo({
        id: 'local-yiru',
        upstream: { owner: 'xinyao27', repo: 'Yiru' }
      }),
      repo({
        id: 'ssh-yiru',
        connectionId: 'builder',
        upstream: { owner: 'xinyao27', repo: 'yiru' }
      }),
      repo({
        id: 'other',
        upstream: { owner: 'xinyao27', repo: 'other' }
      })
    ])

    expect(pickerRepos.map((candidate) => candidate.id)).toEqual(['local-yiru', 'other'])
  })

  it('uses an explicitly selected remote source as the visible project row', () => {
    const pickerRepos = getTaskProjectPickerRepos(
      [
        repo({
          id: 'local-yiru',
          upstream: { owner: 'xinyao27', repo: 'yiru' }
        }),
        repo({
          id: 'ssh-yiru',
          connectionId: 'builder',
          upstream: { owner: 'xinyao27', repo: 'yiru' }
        })
      ],
      new Set(['ssh-yiru'])
    )

    expect(pickerRepos.map((candidate) => candidate.id)).toEqual(['ssh-yiru'])
  })

  it('collapses legacy local and SSH rows that share a GitHub repo icon identity', () => {
    const pickerRepos = getTaskProjectPickerRepos([
      repo({
        id: 'local-claude-swap',
        displayName: 'claude-swap',
        repoIcon: {
          type: 'image',
          src: 'https://github.com/xinyao27.png?size=64',
          source: 'github',
          label: 'xinyao27/claude-swap'
        }
      }),
      repo({
        id: 'ssh-claude-swap',
        displayName: 'claude-swap',
        connectionId: 'builder',
        repoIcon: {
          type: 'image',
          src: 'https://github.com/xinyao27.png?size=64',
          source: 'github',
          label: 'xinyao27/claude-swap'
        }
      })
    ])

    expect(pickerRepos.map((candidate) => candidate.id)).toEqual(['local-claude-swap'])
  })
})

describe('getTaskProjectPickerGroups', () => {
  it('keeps all host sources under one logical project row', () => {
    const groups = getTaskProjectPickerGroups([
      repo({
        id: 'local-yiru',
        upstream: { owner: 'xinyao27', repo: 'yiru' }
      }),
      repo({
        id: 'ssh-yiru',
        connectionId: 'builder',
        upstream: { owner: 'xinyao27', repo: 'yiru' }
      }),
      repo({
        id: 'docs',
        upstream: { owner: 'xinyao27', repo: 'docs' }
      })
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({
      projectKey: 'github:xinyao27/yiru',
      repo: { id: 'local-yiru' }
    })
    expect(groups[0]?.sources.map((source) => source.id)).toEqual(['local-yiru', 'ssh-yiru'])
    expect(groups[1]).toMatchObject({
      projectKey: 'github:xinyao27/docs',
      repo: { id: 'docs' }
    })
  })

  it('uses the explicitly selected source as the project representative', () => {
    const groups = getTaskProjectPickerGroups(
      [
        repo({
          id: 'local-yiru',
          upstream: { owner: 'xinyao27', repo: 'yiru' }
        }),
        repo({
          id: 'ssh-yiru',
          connectionId: 'builder',
          upstream: { owner: 'xinyao27', repo: 'yiru' }
        })
      ],
      new Set(['ssh-yiru'])
    )

    expect(groups[0]?.repo.id).toBe('ssh-yiru')
    expect(groups[0]?.sources.map((source) => source.id)).toEqual(['local-yiru', 'ssh-yiru'])
  })
})

describe('normalizeTaskRepoSelection', () => {
  it('collapses duplicate selected sources for the same logical project', () => {
    const selection = normalizeTaskRepoSelection(
      [
        repo({
          id: 'local-yiru',
          upstream: { owner: 'xinyao27', repo: 'yiru' }
        }),
        repo({
          id: 'ssh-yiru',
          connectionId: 'builder',
          upstream: { owner: 'xinyao27', repo: 'yiru' }
        })
      ],
      new Set(['local-yiru', 'ssh-yiru'])
    )

    expect([...selection]).toEqual(['local-yiru'])
  })

  it('preserves a single explicit remote source selection', () => {
    const selection = normalizeTaskRepoSelection(
      [
        repo({
          id: 'local-yiru',
          upstream: { owner: 'xinyao27', repo: 'yiru' }
        }),
        repo({
          id: 'ssh-yiru',
          connectionId: 'builder',
          upstream: { owner: 'xinyao27', repo: 'yiru' }
        })
      ],
      new Set(['ssh-yiru'])
    )

    expect([...selection]).toEqual(['ssh-yiru'])
  })

  it('normalizes raw all-host selection to one source per logical project', () => {
    const selection = normalizeTaskRepoSelection(
      [
        repo({
          id: 'local-yiru',
          upstream: { owner: 'xinyao27', repo: 'yiru' }
        }),
        repo({
          id: 'ssh-yiru',
          connectionId: 'builder',
          upstream: { owner: 'xinyao27', repo: 'yiru' }
        }),
        repo({
          id: 'docs',
          upstream: { owner: 'xinyao27', repo: 'docs' }
        })
      ],
      new Set(['local-yiru', 'ssh-yiru', 'docs'])
    )

    expect([...selection].sort()).toEqual(['docs', 'local-yiru'])
  })
})
