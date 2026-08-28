import type { ExecutionHostId } from '@yiru/runtime-protocol/model/workspace'

export type HostCommandInput = {
  args: string[]
  command: string
  cwd?: string
  env?: Record<string, string>
  timeoutMs?: number
}

export type HostCommandResult = {
  exitCode: number
  stderr: string
  stdout: string
}

export type HostPtyInput = {
  command?: string
  cwd: string
  env?: Record<string, string>
  shell?: string
}

export type HostPtyLaunch = {
  argv: string[]
  cwd?: string
  env: Record<string, string>
}

export type Host = {
  basename: (path: string) => string
  canonicalDirectory: (path: string) => Promise<string>
  dirname: (path: string) => string
  exec: (input: HostCommandInput) => Promise<HostCommandResult>
  fileExists: (path: string) => Promise<boolean>
  homeDirectory: () => Promise<string | null>
  id: ExecutionHostId
  join: (...parts: string[]) => string
  kind: 'local' | 'ssh' | 'wsl'
  label: string
  platform: 'darwin' | 'linux' | 'win32' | 'unknown'
  ptyLaunch: (input: HostPtyInput) => HostPtyLaunch
  readText: (path: string, maxBytes: number) => Promise<string | null>
  target: string | null
  which: (command: string) => Promise<string | null>
}
