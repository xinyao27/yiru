import { describe, expect, it } from 'vite-plus/test'

import { getExternalEditorOpenCapability } from './external-editor-open-capability'

describe('external editor open capability', () => {
  it('allows a local editor for a local workspace', () => {
    expect(getExternalEditorOpenCapability({ command: 'cursor' })).toEqual({
      allowed: true,
      remote: false
    })
  })

  it('allows VS Code Remote-SSH for a direct SSH workspace', () => {
    expect(getExternalEditorOpenCapability({ connectionId: 'ssh-one', command: 'code' })).toEqual({
      allowed: true,
      remote: true
    })
  })

  it('rejects non-VS-Code editors for SSH workspaces', () => {
    expect(getExternalEditorOpenCapability({ connectionId: 'ssh-one', command: 'cursor' })).toEqual(
      { allowed: false, reason: 'local-only-editor' }
    )
  })

  it('fails closed until the owning runtime advertises support', () => {
    const context = {
      runtimeEnvironmentId: 'runtime-one',
      connectionId: 'ssh-one',
      command: 'code'
    }
    expect(getExternalEditorOpenCapability(context)).toEqual({
      allowed: false,
      reason: 'runtime-host-unsupported'
    })
    expect(
      getExternalEditorOpenCapability({ ...context, runtimeRemoteSshSupported: true })
    ).toEqual({ allowed: true, remote: true })
  })
})
