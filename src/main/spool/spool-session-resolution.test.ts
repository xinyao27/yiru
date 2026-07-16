import { describe, expect, it } from 'vitest'
import type {
  SpoolLiveSessionCandidate,
  SpoolSessionWorktreeIdentity
} from './spool-session-source'
import { resolveLiveSession, spoolLiveTerminalSessionKey } from './spool-session-resolution'

const worktree: SpoolSessionWorktreeIdentity = {
  worktreeId: 'worktree-one',
  instanceId: 'instance-one',
  spoolIncarnationId: 'incarnation-one',
  actualHostScope: 'native',
  target: {
    kind: 'git',
    worktreeId: 'worktree-one',
    instanceId: 'instance-one',
    projectId: 'project-one',
    repoId: 'repo-one',
    executionHostId: 'local',
    worktreePath: '/repo/worktree-one'
  }
}

describe('Spool session resolution', () => {
  it('replaces an empty observed live session key with the stable terminal key', () => {
    const candidate: SpoolLiveSessionCandidate = {
      sessionKey: '',
      terminalHandle: 'terminal-one',
      executionHostId: 'local',
      actualHostScope: 'native',
      worktreeInstanceId: 'instance-one',
      spoolIncarnationId: 'incarnation-one',
      provider: 'other',
      providerSessionId: null,
      sessionKind: 'terminal',
      agent: null,
      title: 'Terminal'
    }

    expect(resolveLiveSession(worktree, candidate).sessionKey).toBe(
      spoolLiveTerminalSessionKey(worktree, candidate.terminalHandle)
    )
  })
})
