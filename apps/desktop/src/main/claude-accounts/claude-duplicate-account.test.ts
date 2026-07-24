import { describe, expect, it } from 'vite-plus/test'

import type { ClaudeManagedAccount } from '../../shared/types'
import {
  findDuplicateClaudeAccount,
  type ClaudeAccountIdentityCandidate
} from './claude-duplicate-account'

function makeAccount(overrides: Partial<ClaudeManagedAccount> = {}): ClaudeManagedAccount {
  return {
    id: 'existing-account',
    email: 'host@example.com',
    managedAuthPath: '/managed/existing-account/auth',
    authMethod: 'subscription-oauth',
    createdAt: 1,
    updatedAt: 1,
    lastAuthenticatedAt: 1,
    ...overrides
  }
}

function makeCandidate(
  overrides: Partial<ClaudeAccountIdentityCandidate> = {}
): ClaudeAccountIdentityCandidate {
  return {
    email: 'host@example.com',
    organizationUuid: null,
    managedAuthRuntime: 'host',
    wslDistro: null,
    ...overrides
  }
}

describe('findDuplicateClaudeAccount', () => {
  it('matches normalized host identities, including legacy runtime fields', () => {
    const account = makeAccount({ email: ' Host@Example.com ' })

    expect(findDuplicateClaudeAccount([account], makeCandidate())?.id).toBe('existing-account')
  })

  it('allows the same email in a different organization', () => {
    const account = makeAccount({ organizationUuid: 'org-a' })

    expect(
      findDuplicateClaudeAccount([account], makeCandidate({ organizationUuid: 'org-b' }))
    ).toBe(null)
  })

  it('isolates host accounts and individual WSL distro buckets', () => {
    const ubuntuAccount = makeAccount({
      managedAuthRuntime: 'wsl',
      organizationUuid: 'org-a',
      wslDistro: 'Ubuntu'
    })

    expect(
      findDuplicateClaudeAccount(
        [ubuntuAccount],
        makeCandidate({ organizationUuid: 'org-a', managedAuthRuntime: 'host' })
      )
    ).toBe(null)
    expect(
      findDuplicateClaudeAccount(
        [ubuntuAccount],
        makeCandidate({
          organizationUuid: 'org-a',
          managedAuthRuntime: 'wsl',
          wslDistro: 'Debian'
        })
      )
    ).toBe(null)
    expect(
      findDuplicateClaudeAccount(
        [ubuntuAccount],
        makeCandidate({
          organizationUuid: 'org-a',
          managedAuthRuntime: 'wsl',
          wslDistro: 'Ubuntu'
        })
      )?.id
    ).toBe('existing-account')
  })
})
