import { describe, expect, it, vi } from 'vite-plus/test'

import {
  buildMobileAiVaultResumeLaunch,
  resumeAiVaultSessionInTerminal
} from './ai-vault-resume-launch'

describe('mobile AI Vault Codex resume routing', () => {
  it('deletes inherited homes for real-home Codex but not managed or non-Codex sessions', () => {
    expect(
      buildMobileAiVaultResumeLaunch({
        session: { agent: 'codex', sessionId: 'real', cwd: '/repo', codexHome: null },
        hostPlatform: 'linux'
      }).envToDelete
    ).toEqual(['CODEX_HOME', 'YIRU_CODEX_HOME'])

    expect(
      buildMobileAiVaultResumeLaunch({
        session: {
          agent: 'codex',
          sessionId: 'managed',
          cwd: '/repo',
          codexHome: '/home/ada/.yiru/codex-account'
        },
        hostPlatform: 'linux'
      }).envToDelete
    ).toBeUndefined()

    expect(
      buildMobileAiVaultResumeLaunch({
        session: { agent: 'claude', sessionId: 'other', cwd: '/repo', codexHome: null },
        hostPlatform: 'linux'
      }).envToDelete
    ).toBeUndefined()
  })

  it('passes deletion through terminal creation before typing the resume command', async () => {
    const sendRequest = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        result: { tab: { type: 'terminal', id: 'tab-1', terminal: 'pty-1', title: 'Terminal' } }
      })
      .mockResolvedValueOnce({ ok: true, result: { send: { accepted: true } } })

    await resumeAiVaultSessionInTerminal({ sendRequest }, 'worktree-1', {
      command: 'codex resume real',
      envToDelete: ['CODEX_HOME', 'YIRU_CODEX_HOME']
    })

    expect(sendRequest).toHaveBeenNthCalledWith(
      1,
      'session.tabs.createTerminal',
      {
        worktree: 'id:worktree-1',
        envToDelete: ['CODEX_HOME', 'YIRU_CODEX_HOME']
      },
      { timeoutMs: 30_000 }
    )
  })
})
