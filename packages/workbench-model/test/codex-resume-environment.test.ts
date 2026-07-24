import { describe, expect, it } from 'vite-plus/test'

import { realHomeCodexResumeEnvDeletion } from '../src/codex-resume-environment'

describe('realHomeCodexResumeEnvDeletion', () => {
  it('deletes only Yiru-owned Codex routing for canonical real-home sessions', () => {
    expect(realHomeCodexResumeEnvDeletion({ agent: 'codex', codexHome: null })).toEqual({
      envToDelete: ['CODEX_HOME', 'YIRU_CODEX_HOME']
    })
  })

  it('preserves managed Codex homes and non-Codex environments', () => {
    expect(
      realHomeCodexResumeEnvDeletion({ agent: 'codex', codexHome: '/home/ada/.codex-managed' })
    ).toEqual({})
    expect(realHomeCodexResumeEnvDeletion({ agent: 'claude', codexHome: null })).toEqual({})
  })
})
