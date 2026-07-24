import { describe, expect, it } from 'vite-plus/test'

import { getCodexAccountAuthWarning } from './codex-account-auth-warning'

const hostArgs = {
  limits: null,
  target: { runtime: 'host' as const, wslDistro: null },
  runtime: { runtime: 'host' as const },
  activeAccountId: null,
  accountId: null
}

describe('getCodexAccountAuthWarning', () => {
  it('warns when the active system-default account is signed out', () => {
    expect(getCodexAccountAuthWarning({ ...hostArgs, authKind: 'none' })).toContain(
      'No Codex sign-in'
    )
  })

  it('does not misclassify system-default API-key auth as signed out', () => {
    expect(getCodexAccountAuthWarning({ ...hostArgs, authKind: 'api-key' })).toBeNull()
  })

  it('does not warn for an inactive system-default row', () => {
    expect(
      getCodexAccountAuthWarning({
        ...hostArgs,
        activeAccountId: 'managed-account',
        authKind: 'none'
      })
    ).toBeNull()
  })
})
