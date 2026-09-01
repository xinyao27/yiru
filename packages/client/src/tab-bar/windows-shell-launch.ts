import type { BuiltInWindowsTerminalShell } from '@yiru/runtime-protocol/model/platform'

export function resolveWindowsShellLaunchTarget(
  shell: BuiltInWindowsTerminalShell,
  powerShellImplementation: 'auto' | 'powershell.exe' | 'pwsh.exe',
  pwshAvailable: boolean
): string {
  if (shell !== 'powershell.exe') {
    return shell
  }

  if (powerShellImplementation === 'auto') {
    return pwshAvailable ? 'pwsh.exe' : 'powershell.exe'
  }

  return powerShellImplementation
}
