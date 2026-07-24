import { describe, expect, it } from 'vite-plus/test'

import { getUsageProviderAccountsSectionId } from './usage-provider-settings-target'

describe('getUsageProviderAccountsSectionId', () => {
  it('routes every Yiru-managed provider to an existing Accounts section', () => {
    expect(getUsageProviderAccountsSectionId('claude')).toBe('accounts-claude')
    expect(getUsageProviderAccountsSectionId('codex')).toBe('accounts-codex')
    expect(getUsageProviderAccountsSectionId('gemini')).toBe('accounts-gemini')
    expect(getUsageProviderAccountsSectionId('antigravity')).toBe('accounts-gemini')
    expect(getUsageProviderAccountsSectionId('opencode-go')).toBe('accounts-opencode-go')
    expect(getUsageProviderAccountsSectionId('minimax')).toBe('accounts-minimax')
    expect(getUsageProviderAccountsSectionId('grok')).toBe('accounts-grok')
  })

  it('leaves CLI-owned Kimi credentials alone', () => {
    expect(getUsageProviderAccountsSectionId('kimi')).toBeNull()
  })
})
