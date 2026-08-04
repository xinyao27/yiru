import type { AgentHookInstallStatus } from '~shared/agent/hook-types'

import { ampHookService } from '../amp/hook-service'
import { antigravityHookService } from '../antigravity/hook-service'
import { claudeHookService } from '../claude/hook-service'
import { codexHookService } from '../codex/hook-service'
import { commandCodeHookService } from '../command-code/hook-service'
import { copilotHookService } from '../copilot/hook-service'
import { cursorHookService } from '../cursor/hook-service'
import { devinHookService } from '../devin/hook-service'
import { droidHookService } from '../droid/hook-service'
import { geminiHookService } from '../gemini/hook-service'
import { grokHookService } from '../grok/hook-service'
import { hermesHookService } from '../hermes/hook-service'
import { kimiHookService } from '../kimi/hook-service'
import { openClaudeHookService } from '../openclaude/hook-service'
import type { RemoteFileOperations } from './remote-file-operations'

export type RemoteManagedHookInstallOptions = {
  /** Explicit CODEX_HOME dir for redirected runtimes (WSL managed runtime
   *  home). Codex-only: it is the one agent whose home Yiru redirects. Also
   *  defers the config.toml trust write until that file exists, so the
   *  launch path's only-if-absent seed is never pre-empted. */
  codexHomeDir?: string
  /** Explicit GROK_HOME for remote runtimes that redirect Grok's config. */
  grokHomeDir?: string
}

type RemoteManagedHookInstaller = readonly [
  AgentHookInstallStatus['agent'],
  (
    remoteFiles: RemoteFileOperations,
    remoteHome: string,
    options?: RemoteManagedHookInstallOptions
  ) => Promise<AgentHookInstallStatus>
]

const REMOTE_MANAGED_HOOK_INSTALLERS: readonly RemoteManagedHookInstaller[] = [
  ['claude', (remoteFiles, remoteHome) => claudeHookService.installRemote(remoteFiles, remoteHome)],
  [
    'openclaude',
    (remoteFiles, remoteHome) => openClaudeHookService.installRemote(remoteFiles, remoteHome)
  ],
  [
    'codex',
    (remoteFiles, remoteHome, options) =>
      codexHookService.installRemote(
        remoteFiles,
        remoteHome,
        options?.codexHomeDir
          ? { codexHomeDir: options.codexHomeDir, deferTrustUntilConfigToml: true }
          : undefined
      )
  ],
  ['gemini', (remoteFiles, remoteHome) => geminiHookService.installRemote(remoteFiles, remoteHome)],
  [
    'antigravity',
    (remoteFiles, remoteHome) => antigravityHookService.installRemote(remoteFiles, remoteHome)
  ],
  ['amp', (remoteFiles, remoteHome) => ampHookService.installRemote(remoteFiles, remoteHome)],
  ['cursor', (remoteFiles, remoteHome) => cursorHookService.installRemote(remoteFiles, remoteHome)],
  [
    'command-code',
    (remoteFiles, remoteHome) => commandCodeHookService.installRemote(remoteFiles, remoteHome)
  ],
  [
    'copilot',
    (remoteFiles, remoteHome) => copilotHookService.installRemote(remoteFiles, remoteHome)
  ],
  [
    'grok',
    (remoteFiles, remoteHome, options) =>
      grokHookService.installRemote(remoteFiles, remoteHome, options?.grokHomeDir)
  ],
  ['droid', (remoteFiles, remoteHome) => droidHookService.installRemote(remoteFiles, remoteHome)],
  ['hermes', (remoteFiles, remoteHome) => hermesHookService.installRemote(remoteFiles, remoteHome)],
  ['devin', (remoteFiles, remoteHome) => devinHookService.installRemote(remoteFiles, remoteHome)],
  ['kimi', (remoteFiles, remoteHome) => kimiHookService.installRemote(remoteFiles, remoteHome)]
]

export async function installRemoteManagedAgentHooks(
  remoteFiles: RemoteFileOperations,
  remoteHome: string,
  options?: RemoteManagedHookInstallOptions
): Promise<AgentHookInstallStatus[]> {
  const results: AgentHookInstallStatus[] = []
  for (const [agent, install] of REMOTE_MANAGED_HOOK_INSTALLERS) {
    try {
      const result = await install(remoteFiles, remoteHome, options)
      results.push(result)
      if (result.state === 'error') {
        console.warn(
          `[agent-hooks] Remote ${agent} managed hook install failed for ${result.configPath}: ${
            result.detail ?? 'unknown error'
          }`
        )
      }
    } catch (error) {
      // Why: remote hook installation must not block workspace startup. A
      // broken agent config or transient file failure should degrade status
      // reporting only, while terminals/filesystem/git still come online.
      const detail = error instanceof Error ? error.message : String(error)
      console.warn(`[agent-hooks] Remote ${agent} managed hook install threw: ${detail}`)
      results.push({
        agent,
        state: 'error',
        configPath: remoteHome,
        managedHooksPresent: false,
        detail
      })
    }
  }
  return results
}
