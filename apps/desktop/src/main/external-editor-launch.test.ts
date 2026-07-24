import { describe, expect, it } from 'vite-plus/test'

import { resolveVsCodeRemoteSshLaunchSpec } from './external-editor-launch'

describe('resolveVsCodeRemoteSshLaunchSpec', () => {
  it('keeps authority and remote path in separate argv', () => {
    expect(
      resolveVsCodeRemoteSshLaunchSpec('code', '/home/alice/project name', 'alice@example.com', {
        platform: 'linux'
      })
    ).toMatchObject({
      kind: 'executable',
      spawnArgs: ['--remote', 'ssh-remote+alice@example.com', '/home/alice/project name']
    })
  })

  it('rejects compound and non-VS-Code commands', () => {
    expect(
      resolveVsCodeRemoteSshLaunchSpec('code --reuse-window', '/srv/project', 'host', {
        platform: 'linux'
      })
    ).toBeNull()
    expect(
      resolveVsCodeRemoteSshLaunchSpec('cursor', '/srv/project', 'host', {
        platform: 'linux'
      })
    ).toBeNull()
  })
})
