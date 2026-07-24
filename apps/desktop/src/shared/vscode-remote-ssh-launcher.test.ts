import { describe, expect, it } from 'vite-plus/test'

import { isVsCodeRemoteSshCommand } from './vscode-remote-ssh-launcher'

describe('VS Code Remote-SSH launcher recognition', () => {
  it.each(['code', 'code-insiders', '/Applications/Visual Studio Code.app/bin/code'])(
    'accepts %s',
    (command) => expect(isVsCodeRemoteSshCommand(command)).toBe(true)
  )

  it.each(['cursor', 'code --reuse-window', 'sh -c code'])('rejects %s', (command) =>
    expect(isVsCodeRemoteSshCommand(command)).toBe(false)
  )

  it('accepts a quoted absolute Windows launcher path', () => {
    expect(isVsCodeRemoteSshCommand('"C:\\Program Files\\VS Code\\code.cmd"')).toBe(true)
  })
})
