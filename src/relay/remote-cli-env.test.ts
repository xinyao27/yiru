import { describe, expect, it } from 'vitest'
import { pickRemoteCliEnv } from './remote-cli-env'

describe('pickRemoteCliEnv', () => {
  it('forwards SSH Yiru terminal and worktree context for remote CLI calls', () => {
    expect(
      pickRemoteCliEnv({
        YIRU_TERMINAL_HANDLE: 'term_ssh',
        YIRU_WORKTREE_ID: 'repo::remote',
        YIRU_PANE_KEY: 'pane-1',
        YIRU_WORKSPACE_ID: 'workspace-1',
        YIRU_USER_DATA_PATH: '/tmp/yiru',
        PATH: '/usr/bin',
        SECRET_TOKEN: 'nope'
      })
    ).toEqual({
      YIRU_TERMINAL_HANDLE: 'term_ssh',
      YIRU_WORKTREE_ID: 'repo::remote',
      YIRU_PANE_KEY: 'pane-1',
      YIRU_WORKSPACE_ID: 'workspace-1',
      YIRU_USER_DATA_PATH: '/tmp/yiru',
      PATH: '/usr/bin'
    })
  })
})
