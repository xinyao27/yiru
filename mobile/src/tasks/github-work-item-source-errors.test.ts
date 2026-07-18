import { describe, expect, it } from 'vite-plus/test'
import {
  extractGitHubIssueSourceError,
  extractGitHubIssueSourceFallback
} from './github-work-item-source-errors'

describe('extractGitHubIssueSourceError', () => {
  it('keeps the failing issue source slug with the repo that produced it', () => {
    expect(
      extractGitHubIssueSourceError(
        { id: 'repo-1', path: '/work/yiru' },
        {
          sources: { issues: { owner: 'upstream', repo: 'yiru' } },
          errors: { issues: { message: 'HTTP 403: resource not accessible' } }
        }
      )
    ).toEqual({
      repoId: 'repo-1',
      repoPath: '/work/yiru',
      source: { owner: 'upstream', repo: 'yiru' },
      message: 'HTTP 403: resource not accessible'
    })
  })

  it('drops issue errors when the source slug is unavailable', () => {
    expect(
      extractGitHubIssueSourceError(
        { id: 'repo-1', path: '/work/yiru' },
        {
          sources: { issues: null },
          errors: { issues: { message: 'failed' } }
        }
      )
    ).toBeNull()
  })

  it('returns null when the envelope has no issue-side error', () => {
    expect(
      extractGitHubIssueSourceError(
        { id: 'repo-1', path: '/work/yiru' },
        {
          sources: { issues: { owner: 'xinyao27', repo: 'yiru' } }
        }
      )
    ).toBeNull()
  })
})

describe('extractGitHubIssueSourceFallback', () => {
  it('reports the repo whose upstream issue source fell back to origin', () => {
    expect(
      extractGitHubIssueSourceFallback(
        { id: 'repo-1', path: '/work/yiru', displayName: 'yiru' },
        {
          issueSourceFellBack: true,
          sources: {
            issues: { owner: 'xinyao27', repo: 'yiru-fork' },
            prs: { owner: 'xinyao27', repo: 'yiru' }
          }
        }
      )
    ).toEqual({
      repoId: 'repo-1',
      repoPath: '/work/yiru',
      repoLabel: 'xinyao27/yiru'
    })
  })

  it('uses the Yiru repo display name when the PR source is unavailable', () => {
    expect(
      extractGitHubIssueSourceFallback(
        { id: 'repo-1', path: '/work/yiru', displayName: 'yiru' },
        {
          issueSourceFellBack: true,
          sources: { issues: null, prs: null }
        }
      )
    ).toEqual({
      repoId: 'repo-1',
      repoPath: '/work/yiru',
      repoLabel: 'yiru'
    })
  })

  it('returns null when the source resolver did not fall back', () => {
    expect(
      extractGitHubIssueSourceFallback(
        { id: 'repo-1', path: '/work/yiru', displayName: 'yiru' },
        {
          sources: { issues: { owner: 'xinyao27', repo: 'yiru' } }
        }
      )
    ).toBeNull()
  })
})
