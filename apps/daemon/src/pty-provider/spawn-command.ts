import { basename } from 'node:path'

import type { PtySpawnOptions } from './contract'

export function resolvePtyEnvironment(
  base: Record<string, string>,
  options: PtySpawnOptions
): Record<string, string> {
  const environment = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)
  )
  Object.assign(environment, base, options.env, { TERM: 'xterm-256color' })
  for (const name of options.envToDelete ?? []) {
    delete environment[name]
  }
  return environment
}

export function resolveRemotePtyEnvironment(
  base: Record<string, string>,
  options: PtySpawnOptions
): Record<string, string> {
  const environment: Record<string, string> = {
    ...base,
    ...options.env,
    TERM: 'xterm-256color'
  }
  for (const name of options.envToDelete ?? []) {
    delete environment[name]
  }
  return environment
}

export function resolvePtyShell(override?: string): string {
  if (override?.trim()) {
    return override.trim()
  }
  return process.platform === 'win32'
    ? process.env.COMSPEC || 'powershell.exe'
    : process.env.SHELL || '/bin/sh'
}

export function resolvePtyCommand(shell: string, command?: string): string[] {
  if (!command) {
    return process.platform === 'win32' ? [shell] : [shell, '-l']
  }
  if (process.platform === 'win32') {
    return basename(shell).toLowerCase() === 'cmd.exe'
      ? [shell, '/d', '/s', '/c', command]
      : [shell, '-NoLogo', '-NoProfile', '-Command', command]
  }
  return [shell, '-lc', command]
}

export function resolvePtySignal(signal: string): number {
  const signals: Record<string, number> = {
    SIGINT: 2,
    SIGQUIT: 3,
    SIGKILL: 9,
    SIGTERM: 15,
    SIGHUP: 1
  }
  return signals[signal.toUpperCase()] ?? 15
}

export function listLocalShellProfiles(): { name: string; path: string }[] {
  if (process.platform === 'win32') {
    return [
      { name: 'PowerShell', path: 'powershell.exe' },
      { name: 'Command Prompt', path: 'cmd.exe' }
    ].filter((profile) => Bun.which(profile.path) !== null)
  }
  return ['/bin/zsh', '/bin/bash', '/bin/sh']
    .filter((path) => Bun.which(path) !== null)
    .map((path) => ({ name: basename(path), path }))
}
