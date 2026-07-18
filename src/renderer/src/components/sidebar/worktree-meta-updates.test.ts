import { describe, expect, it } from 'vite-plus/test'
import { buildWorktreeMetaUpdates } from './worktree-meta-updates'

describe('buildWorktreeMetaUpdates', () => {
  it('rejects issue URLs in the PR input', () => {
    expect(
      buildWorktreeMetaUpdates({
        displayNameInput: 'Workspace',
        currentDisplayName: 'Workspace',
        issueInput: '',
        prInput: 'https://github.com/xinyao27/yiru/issues/6933',
        commentInput: ''
      })
    ).toEqual({
      comment: '',
      linkedIssue: null
    })
  })

  it('accepts PR URLs in the PR input', () => {
    expect(
      buildWorktreeMetaUpdates({
        displayNameInput: 'Workspace',
        currentDisplayName: 'Workspace',
        issueInput: '',
        prInput: 'https://github.com/xinyao27/yiru/pull/6934',
        commentInput: ''
      })
    ).toEqual({
      comment: '',
      linkedIssue: null,
      linkedPR: 6934
    })
  })

  it('accepts issue URLs in the issue input', () => {
    expect(
      buildWorktreeMetaUpdates({
        displayNameInput: 'Workspace',
        currentDisplayName: 'Workspace',
        issueInput: 'https://github.com/xinyao27/yiru/issues/6933',
        prInput: '',
        commentInput: ''
      })
    ).toEqual({
      comment: '',
      linkedIssue: 6933,
      linkedPR: null
    })
  })

  it('rejects PR URLs in the issue input', () => {
    expect(
      buildWorktreeMetaUpdates({
        displayNameInput: 'Workspace',
        currentDisplayName: 'Workspace',
        issueInput: 'https://github.com/xinyao27/yiru/pull/6934',
        prInput: '',
        commentInput: ''
      })
    ).toEqual({
      comment: '',
      linkedPR: null
    })
  })
})
