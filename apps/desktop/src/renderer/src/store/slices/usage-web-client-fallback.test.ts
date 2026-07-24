import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { create } from 'zustand'

import type { AppState } from '../types'
import { createClaudeUsageSlice } from './claude-usage'
import { createCodexUsageSlice } from './codex-usage'
import { createOpenCodeUsageSlice } from './opencode-usage'

function stubWebClientFallback(): void {
  const undefinedAsync = vi.fn(() => Promise.resolve(undefined))
  const provider = {
    getScanState: undefinedAsync,
    setEnabled: undefinedAsync,
    getSnapshot: undefinedAsync,
    refresh: undefinedAsync
  }
  vi.stubGlobal('window', {
    api: {
      claudeUsage: provider,
      codexUsage: provider,
      openCodeUsage: provider
    }
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('usage slices with the Web fallback API', () => {
  it.each([
    {
      provider: 'Claude',
      createSlice: createClaudeUsageSlice,
      fetch: 'fetchClaudeUsage' as const,
      enable: 'enableClaudeUsage' as const,
      scanState: 'claudeUsageScanState' as const
    },
    {
      provider: 'Codex',
      createSlice: createCodexUsageSlice,
      fetch: 'fetchCodexUsage' as const,
      enable: 'enableCodexUsage' as const,
      scanState: 'codexUsageScanState' as const
    },
    {
      provider: 'OpenCode',
      createSlice: createOpenCodeUsageSlice,
      fetch: 'fetchOpenCodeUsage' as const,
      enable: 'enableOpenCodeUsage' as const,
      scanState: 'openCodeUsageScanState' as const
    }
  ])('$provider treats an undefined scan state as unavailable', async (testCase) => {
    stubWebClientFallback()
    const store = create<AppState>()((...args) => testCase.createSlice(...args) as AppState)

    await expect(store.getState()[testCase.fetch]()).resolves.toBeUndefined()
    await expect(store.getState()[testCase.enable]()).resolves.toBeUndefined()
    expect(store.getState()[testCase.scanState]).toBeNull()
  })
})
