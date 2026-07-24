import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const { execFileMock, execFileSyncMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  execFileSyncMock: vi.fn()
}))

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  execFileSync: execFileSyncMock
}))

beforeEach(() => {
  vi.resetModules()
  execFileMock.mockReset()
  execFileSyncMock.mockReset()
})

describe('Windows SSH default shell', () => {
  it('reads and memoizes the OpenSSH DefaultShell registry value', async () => {
    execFileSyncMock.mockReturnValue(
      'HKEY_LOCAL_MACHINE\\SOFTWARE\\OpenSSH\n    DefaultShell    REG_SZ    C:\\Program Files\\PowerShell\\7\\pwsh.exe'
    )
    const { readOpenSshDefaultShell } = await import('./pty-shell-utils')

    expect(readOpenSshDefaultShell()).toBe('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
    expect(readOpenSshDefaultShell()).toBe('C:\\Program Files\\PowerShell\\7\\pwsh.exe')
    expect(execFileSyncMock).toHaveBeenCalledOnce()
  })

  it('prefers an existing OpenSSH shell and safely falls back when it is invalid', async () => {
    const { resolveWindowsDefaultShell } = await import('./pty-shell-utils')
    const powershell = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    const pwsh = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe'
    const env = { SystemRoot: 'C:\\Windows', ComSpec: 'C:\\Windows\\System32\\cmd.exe' }

    expect(
      resolveWindowsDefaultShell(
        env,
        (path) => path === pwsh,
        () => pwsh
      )
    ).toBe(pwsh)
    expect(
      resolveWindowsDefaultShell(
        env,
        (path) => path === powershell,
        () => 'C:\\missing\\pwsh.exe'
      )
    ).toBe(powershell)
  })
})
