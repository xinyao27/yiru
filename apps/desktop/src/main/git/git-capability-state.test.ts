import { describe, expect, it } from 'vite-plus/test'

import { getLocalGitCapabilityCache, getSshGitCapabilityCache } from './git-capability-state'

describe('Git capability execution-host state', () => {
  it('shares native state while isolating each WSL distro', () => {
    expect(getLocalGitCapabilityCache({ cwd: '/repo-a' })).toBe(
      getLocalGitCapabilityCache({ cwd: '/repo-b' })
    )
    expect(getLocalGitCapabilityCache({ wslDistro: 'AuditUbuntu' })).toBe(
      getLocalGitCapabilityCache({ cwd: '\\\\wsl.localhost\\AuditUbuntu\\home\\repo' })
    )
    expect(getLocalGitCapabilityCache({ wslDistro: 'AuditUbuntu' })).not.toBe(
      getLocalGitCapabilityCache({ wslDistro: 'AuditDebian' })
    )
    expect(getLocalGitCapabilityCache()).not.toBe(
      getLocalGitCapabilityCache({ wslDistro: 'AuditUbuntu' })
    )
  })

  it('shares one SSH provider lifetime without leaking into a replacement provider', () => {
    const provider = {}
    const replacementProvider = {}

    expect(getSshGitCapabilityCache(provider)).toBe(getSshGitCapabilityCache(provider))
    expect(getSshGitCapabilityCache(provider)).not.toBe(
      getSshGitCapabilityCache(replacementProvider)
    )
  })
})
