import { describe, expect, it } from 'vitest'
import {
  filterGitHubProjectRowsForRepos,
  findRepoForGitHubProjectRepository,
  normalizeGitHubRepositorySlug
} from './github-project-repo-match'

const repos = [
  { id: 'repo-1', path: '/Users/me/yiru', displayName: 'yiru' },
  { id: 'repo-2', path: '/Users/me/other', displayName: 'other' }
]

describe('GitHub project repo matching', () => {
  it('normalizes owner/repo slugs case-insensitively', () => {
    expect(normalizeGitHubRepositorySlug(' xinyao27/Yiru ')).toBe('xinyao27/yiru')
    expect(normalizeGitHubRepositorySlug('yiru')).toBeNull()
    expect(normalizeGitHubRepositorySlug('xinyao27/yiru/extra')).toBeNull()
  })

  it('matches project rows by resolved repo slug before path/display heuristics', () => {
    expect(
      findRepoForGitHubProjectRepository('xinyao27/yiru', repos, {
        'repo-1': { path: '/Users/me/yiru', slug: 'xinyao27/yiru' }
      })
    ).toBe(repos[0])
  })

  it('does not pick a repo when resolved slugs are ambiguous', () => {
    expect(
      findRepoForGitHubProjectRepository('xinyao27/yiru', repos, {
        'repo-1': { path: '/Users/me/yiru', slug: 'xinyao27/yiru' },
        'repo-2': { path: '/Users/me/other', slug: 'xinyao27/yiru' }
      })
    ).toBeNull()
  })

  it('falls back to exact display/path slug matching when slug resolution is unavailable', () => {
    expect(
      findRepoForGitHubProjectRepository('xinyao27/yiru', [
        { id: 'repo-1', path: '/Users/me/xinyao27/yiru', displayName: 'yiru' }
      ])
    ).toEqual({ id: 'repo-1', path: '/Users/me/xinyao27/yiru', displayName: 'yiru' })
  })

  it('normalizes Windows paths before path slug fallback matching', () => {
    expect(
      findRepoForGitHubProjectRepository('xinyao27/yiru', [
        { id: 'repo-1', path: 'C:\\Users\\me\\xinyao27\\yiru', displayName: 'yiru' }
      ])
    ).toEqual({ id: 'repo-1', path: 'C:\\Users\\me\\xinyao27\\yiru', displayName: 'yiru' })
  })

  it('does not path-match a repo whose resolved slug points somewhere else', () => {
    expect(
      findRepoForGitHubProjectRepository(
        'xinyao27/yiru',
        [{ id: 'repo-1', path: '/Users/me/xinyao27/yiru', displayName: 'yiru' }],
        {
          'repo-1': { path: '/Users/me/xinyao27/yiru', slug: 'fork/yiru' }
        }
      )
    ).toBeNull()
  })

  it('filters project rows to rows backed by open repositories', () => {
    const rows = [
      { id: 'row-1', content: { repository: 'xinyao27/yiru' } },
      { id: 'row-2', content: { repository: 'other/missing' } },
      { id: 'row-3', content: { repository: null } }
    ]

    expect(
      filterGitHubProjectRowsForRepos(rows, repos, {
        'repo-1': { path: '/Users/me/yiru', slug: 'xinyao27/yiru' }
      }).map((row) => row.id)
    ).toEqual(['row-1'])
  })
})
