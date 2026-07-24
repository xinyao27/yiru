import { describe, expect, it, vi } from 'vite-plus/test'

import { buildAiVaultResumeStartupForWorktree } from './ai-vault-resume-command'

vi.mock('@/lib/new-workspace', () => ({ CLIENT_PLATFORM: 'win32' }))

const state = {
  activeRepoId: 'repo-1',
  activeWorktreeId: 'repo-1::worktree-1',
  folderWorkspaces: [],
  projectGroups: [],
  projects: [{ id: 'repo-1', sourceRepoIds: ['repo-1'] }],
  repos: [{ id: 'repo-1', path: 'C:\\repo' }],
  settings: {
    localWindowsRuntimeDefault: { kind: 'windows-host' },
    agentDefaultArgs: { codex: '' },
    agentDefaultEnv: { codex: {} }
  },
  worktreesByRepo: {
    'repo-1': [{ id: 'repo-1::worktree-1', repoId: 'repo-1', path: 'C:\\repo' }]
  }
} as never

describe('desktop AI Vault real-home resume routing', () => {
  it('deletes inherited routing for a local real-home Codex resume', () => {
    expect(
      buildAiVaultResumeStartupForWorktree({
        state,
        session: { agent: 'codex', sessionId: 'local', cwd: 'C:\\repo', codexHome: null }
      }).envToDelete
    ).toEqual(['CODEX_HOME', 'YIRU_CODEX_HOME'])
  })

  it('preserves deletion when an SSH session uses its host-built resume command', () => {
    expect(
      buildAiVaultResumeStartupForWorktree({
        state,
        session: {
          agent: 'codex',
          sessionId: 'ssh',
          cwd: '/srv/repo',
          codexHome: null,
          executionHostId: 'ssh:connection-1',
          resumeCommand: 'codex resume ssh'
        }
      })
    ).toEqual({
      command: 'codex resume ssh',
      envToDelete: ['CODEX_HOME', 'YIRU_CODEX_HOME']
    })
  })
})
