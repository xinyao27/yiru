// @ts-nocheck -- Vite Plus injects the vitest API at test time; production tsconfig intentionally omits that package.
import { describe, expect, it } from 'vite-plus/test'

import { stripCodexManagedHookTrustEntriesFromConfig } from './codex-managed-trust-reconciliation'
import {
  computeTrustKey,
  readHookTrustEntriesFromContent,
  upsertHookTrustEntriesInContent,
  type CodexTrustEntry
} from './config-toml-trust'

describe('stripCodexManagedHookTrustEntriesFromConfig', () => {
  it('removes only trust proven to belong to the source-home managed hook', () => {
    const sourcePath = '/home/ada/.codex/hooks.json'
    const managed: CodexTrustEntry = {
      sourcePath,
      eventLabel: 'stop',
      groupIndex: 0,
      handlerIndex: 0,
      command: '/opt/yiru/codex-hook',
      timeoutSec: 10
    }
    const userOwned: CodexTrustEntry = {
      ...managed,
      handlerIndex: 1,
      command: '/home/ada/my-hook'
    }
    const config = upsertHookTrustEntriesInContent('approval_policy = "never"\n', [
      managed,
      userOwned
    ])

    const sanitized = stripCodexManagedHookTrustEntriesFromConfig(config, {
      runtimeHomePath: '/home/ada/.codex',
      sourcePath,
      command: managed.command,
      managedEventLabels: new Set(['stop']),
      timeoutSec: 10
    })
    const trust = readHookTrustEntriesFromContent(sanitized)

    expect(trust.has(computeTrustKey(managed))).toBe(false)
    expect(trust.has(computeTrustKey(userOwned))).toBe(true)
    expect(sanitized).toContain('approval_policy = "never"')
  })
})
