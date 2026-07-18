import { describe, expect, it } from 'vite-plus/test'
import {
  buildSetupRunnerCommand,
  getSetupRunnerCommandPlatformForPath
} from './setup-runner-command'

describe('buildSetupRunnerCommand', () => {
  it('uses bash for WSL UNC runner scripts regardless of host casing', () => {
    expect(
      buildSetupRunnerCommand(
        '\\\\WSL.LOCALHOST\\Ubuntu\\home\\jin\\repo\\.git\\worktrees\\feature\\yiru\\setup-runner.sh',
        'windows'
      )
    ).toBe('bash /home/jin/repo/.git/worktrees/feature/yiru/setup-runner.sh')
  })

  it('uses bash with Linux paths for forward-slash WSL UNC runner scripts', () => {
    expect(
      buildSetupRunnerCommand(
        '//wsl.localhost/Ubuntu/home/jin/repo/.git/worktrees/feature/yiru/setup-runner.sh',
        'windows'
      )
    ).toBe('bash /home/jin/repo/.git/worktrees/feature/yiru/setup-runner.sh')
  })

  it('keeps generic forward-slash UNC runner scripts on cmd.exe', () => {
    expect(
      buildSetupRunnerCommand('//server/share/repo/.git/yiru/setup-runner.cmd', 'windows')
    ).toBe('cmd.exe /c "//server/share/repo/.git/yiru/setup-runner.cmd"')
  })
})

describe('getSetupRunnerCommandPlatformForPath', () => {
  it('prefers POSIX for absolute POSIX runner paths even from Windows clients', () => {
    expect(
      getSetupRunnerCommandPlatformForPath('/remote/repo/.git/yiru/setup-runner.sh', 'windows')
    ).toBe('posix')
  })

  it('prefers Windows for native Windows runner paths even from POSIX clients', () => {
    expect(
      getSetupRunnerCommandPlatformForPath('C:\\repo\\.git\\yiru\\setup-runner.cmd', 'posix')
    ).toBe('windows')
  })

  it('keeps WSL UNC paths on the Windows resolver so they can be converted', () => {
    expect(
      getSetupRunnerCommandPlatformForPath(
        '\\\\wsl.localhost\\Ubuntu\\home\\jin\\repo\\.git\\yiru\\setup-runner.sh',
        'posix'
      )
    ).toBe('windows')
  })

  it('keeps forward-slash UNC paths on the Windows resolver', () => {
    expect(
      getSetupRunnerCommandPlatformForPath(
        '//wsl.localhost/Ubuntu/home/jin/repo/.git/yiru/setup-runner.sh',
        'posix'
      )
    ).toBe('windows')
    expect(
      getSetupRunnerCommandPlatformForPath(
        '//server/share/repo/.git/yiru/setup-runner.cmd',
        'posix'
      )
    ).toBe('windows')
  })
})
