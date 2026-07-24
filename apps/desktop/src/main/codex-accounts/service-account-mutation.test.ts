import { describe, expect, it, vi } from 'vite-plus/test'

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp/yiru-test') } }))

import type { CodexManagedAccount } from '../../shared/types'
import { CodexAccountService } from './service'

type MutableSettings = {
  codexManagedAccounts: CodexManagedAccount[]
  activeCodexManagedAccountId: string | null
  activeCodexManagedAccountIdsByRuntime: {
    host: string | null
    wsl: Record<string, string | null>
  }
}

function createAccount(id = 'account-1'): CodexManagedAccount {
  return {
    id,
    email: `${id}@example.com`,
    managedHomePath: `/managed/${id}/home`,
    providerAccountId: id,
    workspaceLabel: null,
    workspaceAccountId: id,
    createdAt: 1,
    updatedAt: 1,
    lastAuthenticatedAt: 1
  }
}

function createServiceHarness(refreshForCodexAccountChange: ReturnType<typeof vi.fn>) {
  const account = createAccount()
  let settings: MutableSettings = {
    codexManagedAccounts: [account],
    activeCodexManagedAccountId: account.id,
    activeCodexManagedAccountIdsByRuntime: {
      host: account.id,
      wsl: { Ubuntu: 'wsl-account' }
    }
  }
  const store = {
    getSettings: () => settings,
    updateSettings: vi.fn((update: Partial<MutableSettings>) => {
      settings = { ...settings, ...update }
    })
  }
  const runtimeHome = {
    syncForCurrentSelection: vi.fn(),
    clearLastWrittenAuthJson: vi.fn()
  }
  const service = Object.create(CodexAccountService.prototype) as CodexAccountService &
    Record<string, unknown>
  Object.assign(service, {
    store,
    rateLimits: {
      refreshForCodexAccountChange,
      evictInactiveCodexCache: vi.fn()
    },
    runtimeHome,
    safeSyncCanonicalConfigToManagedHomes: vi.fn(),
    safeSyncCanonicalConfigIntoManagedHome: vi.fn(),
    getSnapshot: vi.fn(() => ({
      accounts: [],
      activeAccountId: settings.activeCodexManagedAccountId,
      activeAccountIdsByRuntime: settings.activeCodexManagedAccountIdsByRuntime,
      systemDefault: null
    }))
  })
  return { account, getSettings: () => settings, runtimeHome, service, store }
}

describe('CodexAccountService account mutations', () => {
  it('does not wait for a slow quota refresh after switching accounts', async () => {
    let finishRefresh: (() => void) | undefined
    const refreshForCodexAccountChange = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = resolve
        })
    )
    const { service } = createServiceHarness(refreshForCodexAccountChange)

    await expect(
      (
        service as unknown as { doSelectAccount: (id: string | null) => Promise<unknown> }
      ).doSelectAccount(null)
    ).resolves.toBeDefined()
    expect(refreshForCodexAccountChange).toHaveBeenCalledOnce()
    finishRefresh?.()
  })

  it('contains background quota refresh failures', async () => {
    const refreshError = new Error('quota unavailable')
    const refreshForCodexAccountChange = vi.fn().mockRejectedValue(refreshError)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { service } = createServiceHarness(refreshForCodexAccountChange)

    await expect(
      (
        service as unknown as { doSelectAccount: (id: string | null) => Promise<unknown> }
      ).doSelectAccount(null)
    ).resolves.toBeDefined()
    await vi.waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith(
        '[codex-accounts] Quota refresh after account change failed:',
        refreshError
      )
    )

    errorSpy.mockRestore()
  })

  it('restores the selected runtime account when reauthentication fails', async () => {
    const refreshForCodexAccountChange = vi.fn().mockResolvedValue(undefined)
    const { account, getSettings, service } = createServiceHarness(refreshForCodexAccountChange)
    Object.assign(service, {
      requireAccount: vi.fn(() => account),
      ensureManagedHomeForReauthentication: vi.fn(() => account.managedHomePath),
      runCodexLogin: vi.fn(async () => {
        const harness = service as unknown as {
          store: { updateSettings: (update: Partial<MutableSettings>) => void }
        }
        harness.store.updateSettings({
          activeCodexManagedAccountId: null,
          activeCodexManagedAccountIdsByRuntime: {
            host: null,
            wsl: { Ubuntu: 'wsl-account' }
          }
        })
        throw new Error('login failed')
      })
    })

    await expect(
      (
        service as unknown as {
          doReauthenticateAccount: (id: string) => Promise<unknown>
        }
      ).doReauthenticateAccount(account.id)
    ).rejects.toThrow('login failed')

    expect(getSettings().activeCodexManagedAccountIdsByRuntime).toEqual({
      host: account.id,
      wsl: { Ubuntu: 'wsl-account' }
    })
    expect(refreshForCodexAccountChange).not.toHaveBeenCalled()
  })
})
