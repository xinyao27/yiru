import { LOCAL_EXECUTION_HOST_ID } from '@yiru/workbench-model/workspace'
import { describe, expect, it } from 'vite-plus/test'

import {
  collectLiveRepoIdsForHost,
  shouldHydratePersistedWorktreeSession
} from './headless-session-repo-hydration'

describe('shouldHydratePersistedWorktreeSession', () => {
  it('keeps live and unparseable owners but rejects a deleted repo', () => {
    const liveRepoIds = new Set(['live-repo'])

    expect(shouldHydratePersistedWorktreeSession('live-repo::/work/live', liveRepoIds)).toBe(true)
    expect(
      shouldHydratePersistedWorktreeSession('worktree:live-repo::/work/live', liveRepoIds)
    ).toBe(true)
    expect(shouldHydratePersistedWorktreeSession('deleted-repo::/work/deleted', liveRepoIds)).toBe(
      false
    )
    expect(shouldHydratePersistedWorktreeSession('legacy-synthetic-owner', liveRepoIds)).toBe(true)
  })

  it('does not treat a same-id repo on another host as a live local owner', () => {
    const localRepoIds = collectLiveRepoIdsForHost(
      [{ id: 'shared-repo', executionHostId: 'ssh:target' }],
      LOCAL_EXECUTION_HOST_ID
    )

    expect(localRepoIds.has('shared-repo')).toBe(false)
  })
})
