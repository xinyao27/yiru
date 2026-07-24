import { describe, expect, it } from 'vite-plus/test'

import { resolveWindowsShellLaunchArgs } from './windows-shell-args'

function decodePowerShellCommand(cwd: string): string {
  const result = resolveWindowsShellLaunchArgs('powershell.exe', cwd, 'C:\\Users\\alice')
  expect(result.shellArgs.slice(0, 3)).toEqual(['-NoLogo', '-NoExit', '-EncodedCommand'])
  return Buffer.from(result.shellArgs[3] ?? '', 'base64').toString('utf16le')
}

describe('resolveWindowsShellLaunchArgs', () => {
  it('restores the requested cwd after the PowerShell profile and prompt bootstrap', () => {
    const command = decodePowerShellCommand('C:\\Users\\alice\\project')
    const promptIndex = command.indexOf('function Global:prompt')
    const restoreIndex = command.indexOf(
      "try { Set-Location -LiteralPath 'C:\\Users\\alice\\project' -ErrorAction Stop }"
    )

    expect(restoreIndex).toBeGreaterThan(promptIndex)
  })

  it('quotes cwd values as PowerShell literals', () => {
    expect(decodePowerShellCommand("C:\\Users\\alice\\client's app")).toContain(
      "Set-Location -LiteralPath 'C:\\Users\\alice\\client''s app'"
    )
  })
})
