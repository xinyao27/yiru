import { describe, expect, it } from 'vite-plus/test'
import { getSourceControlActions } from './source-control-actions'

describe('getSourceControlActions', () => {
  it('shows discard and stage actions for untracked files', () => {
    expect(getSourceControlActions('untracked')).toEqual(['discard', 'stage'])
  })

  it('shows discard and stage actions for unstaged files', () => {
    expect(getSourceControlActions('unstaged')).toEqual(['discard', 'stage'])
  })

  it('shows unstage action for staged files', () => {
    expect(getSourceControlActions('staged')).toEqual(['unstage'])
  })
})
