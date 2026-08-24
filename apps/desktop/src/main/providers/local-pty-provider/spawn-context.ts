import type { injectHistoryEnv } from '~main/terminal-history'
import type { parseWslPath } from '~main/wsl'
import type { recognizeAgentProcessFromCommandLine } from '~shared/agent/process-recognition'

import type { getShellReadyLaunchConfig } from '../local-pty-shell-ready'
import type { PtySpawnOptions } from '../types'
import type { buildWindowsPowerShellSpawnAttempts } from '../windows-shell-fallback-chain'
import type { getWslContextFromPreferredDistro, getWslContextFromWorktreeId } from './state'

export type LocalPtyShellContext = {
  args: PtySpawnOptions
  id: string
  startupAgentRecognition: ReturnType<typeof recognizeAgentProcessFromCommandLine>
  defaultCwd: string
  cwd: string
  wslInfo: ReturnType<typeof parseWslPath>
  worktreeWslContext: ReturnType<typeof getWslContextFromWorktreeId>
  preferredWslContext: ReturnType<typeof getWslContextFromPreferredDistro>
  shellPath: string
  shellArgs: string[]
  effectiveCwd: string
  validationCwd: string
  startupCommandDeliveredInShellArgs: boolean
  windowsFallbackAttempts: ReturnType<typeof buildWindowsPowerShellSpawnAttempts>
  shellReadyLaunch: ReturnType<typeof getShellReadyLaunchConfig> | null
  getFallbackShellReadyConfig:
    | ((shell: string) => ReturnType<typeof getShellReadyLaunchConfig>)
    | undefined
}

export type LocalPtyEnvironmentContext = LocalPtyShellContext & {
  finalEnv: Record<string, string>
  historyResult: ReturnType<typeof injectHistoryEnv> | null
}
