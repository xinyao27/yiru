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
    expect(normalizeGitHubRepositorySlug(' StablyAI/Yiru ')).toBe('stablyai/yiru')
    expect(normalizeGitHubRepositorySlug('yiru')).toBeNull()
    expect(normalizeGitHubRepositorySlug('stablyai/yiru/extra')).toBeNull()
  })

  it('matches project rows by resolved repo slug before path/display heuristics', () => {
    expect(
      findRepoForGitHubProjectRepository('stablyai/yiru', repos, {
        'repo-1': { path: '/Users/me/yiru', slug: 'stablyai/yiru' }
      })
    ).toBe(repos[0])
  })

  it('does not pick a repo when resolved slugs are ambiguous', () => {
    expect(
      findRepoForGitHubProjectRepository('stablyai/yiru', repos, {
        'repo-1': { path: '/Users/me/yiru', slug: 'stablyai/yiru' },
        'repo-2': { path: '/Users/me/other', slug: 'stablyai/yiru' }
      })
    ).toBeNull()
  })

  it('falls back to exact display/path slug matching when slug resolution is unavailable', () => {
    expect(
      findRepoForGitHubProjectRepository('stablyai/yiru', [
        { id: 'repo-1', path: '/Users/me/stablyai/yiru', displayName: 'yiru' }
      ])
    ).toEqual({ id: 'repo-1', path: '/Users/me/stablyai/yiru', displayName: 'yiru' })
  })

  it('normalizes Windows paths before path slug fallback matching', () => {
    expect(
      findRepoForGitHubProjectRepository('stablyai/yiru', [
        { id: 'repo-1', path: 'C:\\Users\\me\\stablyai\\yiru', displayName: 'yiru' }
      ])
    ).toEqual({ id: 'repo-1', path: 'C:\\Users\\me\\stablyai\\yiru', displayName: 'yiru' })
  })

  it('does not path-match a repo whose resolved slug points somewhere else', () => {
    expect(
      findRepoForGitHubProjectRepository(
        'stablyai/yiru',
        [{ id: 'repo-1', path: '/Users/me/stablyai/yiru', displayName: 'yiru' }],
        {
          'repo-1': { path: '/Users/me/stablyai/yiru', slug: 'fork/yiru' }
        }
      )
    ).toBeNull()
  })

  it('filters project rows to rows backed by open repositories', () => {
    const rows = [
      { id: 'row-1', content: { repository: 'stablyai/yiru' } },
      { id: 'row-2', content: { repository: 'other/missing' } },
      { id: 'row-3', content: { repository: null } }
    ]

    expect(
      filterGitHubProjectRowsForRepos(rows, repos, {
        'repo-1': { path: '/Users/me/yiru', slug: 'stablyai/yiru' }
      }).map((row) => row.id)
    ).toEqual(['row-1'])
  })
})
