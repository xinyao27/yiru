import type { SleepingAgentLaunchConfig } from '@yiru/workbench-model/agent'
import type {
  RuntimeTerminalCreate,
  RuntimeTerminalPresentation,
  RuntimeMobileSessionCreateTerminalResult
} from '~shared/runtime-types'
import type { WorktreeStartupLaunch, TuiAgent } from '~shared/types'

import { MOBILE_TERMINAL_CREATE_RESULT_TTL_MS } from '../model/terminal-startup'
import { findLocalRepoById } from '../model/worktree-storage'
import { RuntimeTerminalCreateTerminal } from './create-terminal'

export abstract class RuntimeTerminalLaunchAgentTerminal extends RuntimeTerminalCreateTerminal {
  async launchAgentTerminal(
    worktreeSelector: string,
    opts: { agent: TuiAgent; prompt: string; title?: string }
  ): Promise<RuntimeTerminalCreate> {
    const worktree = await this.resolveWorktreeSelector(worktreeSelector)
    const repo = this.store ? findLocalRepoById(this.store, worktree.repoId) : undefined
    if (!repo) {
      throw new Error('Repository for the selected workspace is no longer available.')
    }
    const startup = this.buildStartupForAgent(repo, opts.agent, opts.prompt)
    this.markLocalWorkspaceTrustedForAgent(opts.agent, worktree.path)
    return await this.createTerminal(`id:${worktree.id}`, {
      command: startup.startup.command,
      env: startup.startup.env,
      ...(startup.startup.launchConfig ? { launchConfig: startup.startup.launchConfig } : {}),
      launchAgent: startup.agent,
      startupCommandDelivery: startup.startup.startupCommandDelivery,
      telemetry: startup.startup.telemetry,
      title: opts.title
    })
  }

  async createAgentTerminal(
    worktreeSelector: string,
    opts: {
      agent: TuiAgent
      title?: string
      presentation?: RuntimeTerminalPresentation
      beforeAgentTrust?: () => void | Promise<void>
      beforeSpawn?: () => void | Promise<void>
    }
  ): Promise<RuntimeTerminalCreate> {
    const workspace = await this.resolveTerminalWorkspaceLaunchScope(worktreeSelector)
    const repo = workspace.repo
    if (!repo) {
      throw new Error('Repository for the selected workspace is no longer available.')
    }
    const startup = this.buildStartupForAgent(repo, opts.agent, '')
    // Why: remote control can be revoked while agent settings and host routing are resolved.
    await opts.beforeAgentTrust?.()
    if (!workspace.connectionId) {
      this.markLocalWorkspaceTrustedForAgent(opts.agent, workspace.path)
    }
    return await this.createTerminal(`id:${workspace.id}`, {
      command: startup.startup.command,
      env: startup.startup.env,
      ...(startup.startup.launchConfig ? { launchConfig: startup.startup.launchConfig } : {}),
      launchAgent: startup.agent,
      startupCommandDelivery: startup.startup.startupCommandDelivery,
      telemetry: startup.startup.telemetry,
      title: opts.title,
      presentation: opts.presentation ?? 'background',
      beforeSpawn: opts.beforeSpawn
    })
  }

  async createMobileSessionTerminal(
    worktreeSelector: string,
    opts: {
      afterTabId?: string
      targetGroupId?: string
      command?: string
      cwd?: string
      env?: Record<string, string>
      envToDelete?: string[]
      startupCommandDelivery?: WorktreeStartupLaunch['startupCommandDelivery']
      agent?: TuiAgent
      agentPrompt?: string
      launchConfig?: SleepingAgentLaunchConfig
      launchAgent?: TuiAgent
      activate?: boolean
      clientMutationId?: string
      signal?: AbortSignal
    } = {}
  ): Promise<RuntimeMobileSessionCreateTerminalResult> {
    const mutationId = opts.clientMutationId
    if (!mutationId) {
      return this.runCreateMobileSessionTerminal(worktreeSelector, opts)
    }
    const mutationKey = `${worktreeSelector}\0${mutationId}`
    // Why: a retried create (double-tap, reconnect replay) with the same
    // idempotency key must return the in-flight operation instead of spawning a
    // duplicate terminal. Successes are kept briefly so a retry whose response
    // was lost in transit reuses the created terminal; failures are dropped
    // immediately so a retry can start a fresh create.
    const inflight = this.mobileTerminalCreateByMutationId.get(mutationKey)
    if (inflight) {
      return inflight
    }
    const run = this.runCreateMobileSessionTerminal(worktreeSelector, opts)
    this.mobileTerminalCreateByMutationId.set(mutationKey, run)
    const drop = (): void => {
      if (this.mobileTerminalCreateByMutationId.get(mutationKey) === run) {
        this.mobileTerminalCreateByMutationId.delete(mutationKey)
      }
    }
    void run.then(() => {
      setTimeout(drop, MOBILE_TERMINAL_CREATE_RESULT_TTL_MS).unref?.()
    }, drop)
    return run
  }
}
