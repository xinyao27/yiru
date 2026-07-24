import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type {
  ClaudeRateLimitAccountsState,
  CodexRateLimitAccountsState
} from '../../../shared/types'

vi.mock('./runtime-rpc-client', () => ({
  callRuntimeRpc: vi.fn(),
  getActiveRuntimeTarget: (
    settings: { activeRuntimeEnvironmentId?: string | null } | null | undefined
  ) => {
    const environmentId = settings?.activeRuntimeEnvironmentId?.trim()
    return environmentId
      ? { kind: 'environment' as const, environmentId }
      : { kind: 'local' as const }
  },
  RuntimeRpcCallError: class RuntimeRpcCallError extends Error {
    constructor(response: { error?: { message?: string } }) {
      super(response.error?.message ?? 'Runtime RPC failed')
    }
  }
}))

import {
  fetchProviderAccountsSnapshot,
  type ProviderAccountsSnapshot
} from './runtime-provider-accounts-client'

const claudeList = vi.fn()
const codexList = vi.fn()
const subscribe = vi.fn()

function emptyClaudeState(): ClaudeRateLimitAccountsState {
  return { accounts: [], activeAccountId: null, activeAccountIdsByRuntime: { host: null, wsl: {} } }
}

function emptyCodexState(): CodexRateLimitAccountsState {
  return { accounts: [], activeAccountId: null, activeAccountIdsByRuntime: { host: null, wsl: {} } }
}

function snapshot(marker: string): ProviderAccountsSnapshot {
  return {
    claude: { ...emptyClaudeState(), activeAccountId: `claude-${marker}` },
    codex: { ...emptyCodexState(), activeAccountId: `codex-${marker}` },
    rateLimits: null
  }
}

beforeEach(() => {
  claudeList.mockReset()
  codexList.mockReset()
  subscribe.mockReset()
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    api: {
      claudeAccounts: { list: claudeList },
      codexAccounts: { list: codexList },
      runtimeEnvironments: { subscribe }
    }
  })
})

describe('fetchProviderAccountsSnapshot', () => {
  it('deduplicates concurrent local reads without caching completed snapshots', async () => {
    let resolveClaude!: (state: ClaudeRateLimitAccountsState) => void
    let resolveCodex!: (state: CodexRateLimitAccountsState) => void
    claudeList.mockImplementation(
      () => new Promise<ClaudeRateLimitAccountsState>((resolve) => (resolveClaude = resolve))
    )
    codexList.mockImplementation(
      () => new Promise<CodexRateLimitAccountsState>((resolve) => (resolveCodex = resolve))
    )

    const first = fetchProviderAccountsSnapshot({ activeRuntimeEnvironmentId: null })
    const second = fetchProviderAccountsSnapshot({ activeRuntimeEnvironmentId: null })
    expect(second).toBe(first)

    resolveClaude(emptyClaudeState())
    resolveCodex(emptyCodexState())
    await first

    claudeList.mockResolvedValue(emptyClaudeState())
    codexList.mockResolvedValue(emptyCodexState())
    await fetchProviderAccountsSnapshot({ activeRuntimeEnvironmentId: null })
    expect(claudeList).toHaveBeenCalledTimes(2)
    expect(codexList).toHaveBeenCalledTimes(2)
  })

  it('isolates concurrent snapshots by remote account owner', async () => {
    const callbacks: { onResponse: (response: unknown) => void }[] = []
    subscribe.mockImplementation(async (_request, handlers) => {
      callbacks.push(handlers)
      return { unsubscribe: vi.fn() }
    })

    const first = fetchProviderAccountsSnapshot({ activeRuntimeEnvironmentId: 'env-1' })
    const second = fetchProviderAccountsSnapshot({ activeRuntimeEnvironmentId: 'env-2' })
    await Promise.resolve()

    callbacks[0]?.onResponse({ ok: true, result: { type: 'ready', snapshot: snapshot('one') } })
    callbacks[1]?.onResponse({ ok: true, result: { type: 'ready', snapshot: snapshot('two') } })

    await expect(first).resolves.toMatchObject({ codex: { activeAccountId: 'codex-one' } })
    await expect(second).resolves.toMatchObject({ codex: { activeAccountId: 'codex-two' } })
  })

  it('does not share local work with a remote environment named local', async () => {
    claudeList.mockResolvedValue(emptyClaudeState())
    codexList.mockResolvedValue(emptyCodexState())
    subscribe.mockImplementation(async (_request, handlers) => {
      queueMicrotask(() => {
        handlers.onResponse({
          ok: true,
          result: { type: 'ready', snapshot: snapshot('remote-local') }
        })
      })
      return { unsubscribe: vi.fn() }
    })

    const local = fetchProviderAccountsSnapshot({ activeRuntimeEnvironmentId: null })
    const remote = fetchProviderAccountsSnapshot({ activeRuntimeEnvironmentId: 'local' })

    expect(remote).not.toBe(local)
    await expect(remote).resolves.toMatchObject({
      codex: { activeAccountId: 'codex-remote-local' }
    })
    await expect(local).resolves.toMatchObject({ codex: { activeAccountId: null } })
  })
})
