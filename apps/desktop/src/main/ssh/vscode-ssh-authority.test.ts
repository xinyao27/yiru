import type { SshTarget } from '@yiru/runtime-protocol/ssh-connection'
import { describe, expect, it } from 'vite-plus/test'

import { resolveVsCodeSshAuthority } from './vscode-ssh-authority'

function target(overrides: Partial<SshTarget> = {}): SshTarget {
  return {
    id: 'target',
    label: 'Target',
    host: 'example.com',
    port: 22,
    username: 'alice',
    source: 'manual',
    ...overrides
  }
}

describe('resolveVsCodeSshAuthority', () => {
  it('uses the config alias when OpenSSH owns the target', () => {
    expect(
      resolveVsCodeSshAuthority(
        target({ source: 'ssh-config', configHost: 'production', host: '10.0.0.8', port: 2202 })
      )
    ).toEqual({ ok: true, authority: 'production' })
  })

  it('uses username@host for a manual port 22 target', () => {
    expect(resolveVsCodeSshAuthority(target())).toEqual({
      ok: true,
      authority: 'alice@example.com'
    })
  })

  it('requires a config alias for a manual non-default port', () => {
    expect(resolveVsCodeSshAuthority(target({ port: 2202 }))).toEqual({
      ok: false,
      reason: 'ssh-alias-required',
      host: 'example.com',
      port: 2202
    })
  })

  it('rejects control characters in an authority', () => {
    expect(resolveVsCodeSshAuthority(target({ host: 'bad\nhost' }))).toEqual({
      ok: false,
      reason: 'ssh-target-invalid'
    })
  })
})
