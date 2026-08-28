import type { WslPathInfo } from '../../platform/wsl'

export type ResolvedCommand = {
  binary: string
  args: string[]
  cwd: string | undefined
  wsl: WslPathInfo | null
}

export type GitExecOptions = {
  cwd: string
  encoding?: BufferEncoding | 'buffer'
  maxBuffer?: number
  timeout?: number
  stdin?: string
  env?: NodeJS.ProcessEnv
  signal?: AbortSignal
  wslDistro?: string
  useConfiguredSshCommandForNetwork?: boolean
}
