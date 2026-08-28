import { realpath, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import type { Host } from './contract'
import { localEnvironment, runHostProcess } from './process'

export function createLocalHost(): Host {
  return {
    basename,
    canonicalDirectory: async (path) => {
      const canonical = await realpath(path)
      if (!(await stat(canonical)).isDirectory()) {
        throw new Error('host_path_not_directory')
      }
      return canonical
    },
    dirname,
    exec: (input) =>
      runHostProcess([input.command, ...input.args], {
        cwd: input.cwd,
        env: input.env,
        timeoutMs: input.timeoutMs
      }),
    fileExists: async (path) => {
      try {
        await stat(path)
        return true
      } catch {
        return false
      }
    },
    homeDirectory: async () => homedir(),
    id: 'local',
    join,
    kind: 'local',
    label: localLabel(),
    platform: localPlatform(),
    ptyLaunch: (input) => {
      const shell = input.shell?.trim() || defaultShell()
      return {
        argv: input.command ? shellCommand(shell, input.command) : loginShell(shell),
        cwd: input.cwd,
        env: localEnvironment(input.env)
      }
    },
    readText: async (path, maxBytes) => {
      const file = Bun.file(path)
      if (!(await file.exists()) || file.size > maxBytes) {
        return null
      }
      return file.text()
    },
    target: null,
    which: async (command) => Bun.which(command)
  }
}

function defaultShell(): string {
  return process.platform === 'win32'
    ? process.env.COMSPEC || 'powershell.exe'
    : process.env.SHELL || '/bin/sh'
}

function loginShell(shell: string): string[] {
  return process.platform === 'win32' ? [shell] : [shell, '-l']
}

function shellCommand(shell: string, command: string): string[] {
  if (process.platform !== 'win32') {
    return [shell, '-lc', command]
  }
  return basename(shell).toLowerCase() === 'cmd.exe'
    ? [shell, '/d', '/s', '/c', command]
    : [shell, '-NoLogo', '-NoProfile', '-Command', command]
}

function localLabel(): string {
  switch (process.platform) {
    case 'darwin':
      return 'Local Mac'
    case 'linux':
      return 'Local Linux'
    case 'win32':
      return 'Local Windows'
    default:
      return 'This computer'
  }
}

function localPlatform(): Host['platform'] {
  return process.platform === 'darwin' ||
    process.platform === 'linux' ||
    process.platform === 'win32'
    ? process.platform
    : 'unknown'
}
