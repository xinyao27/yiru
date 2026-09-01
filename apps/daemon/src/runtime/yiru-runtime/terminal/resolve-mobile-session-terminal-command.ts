import type { SleepingAgentLaunchConfig } from '@yiru/runtime-protocol/model/agent'
import { resolveLocalWindowsAgentStartupShell } from '@yiru/runtime-protocol/model/platform'
import { repoIsRemote } from '@yiru/runtime-protocol/workbench/agent/launch-remote'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '@yiru/runtime-protocol/workbench/tui-agent/launch-defaults'
import { isTuiAgentEnabled } from '@yiru/runtime-protocol/workbench/tui-agent/selection'
import { buildAgentStartupPlan } from '@yiru/runtime-protocol/workbench/tui-agent/startup'
import type { WorktreeStartupLaunch, TuiAgent } from '@yiru/runtime-protocol/workbench/types'

import type { TerminalWorkspaceLaunchScope } from '../model/worktree-resolution'
import { RuntimeTerminalRunCreateMobileSessionTerminal } from './run-create-mobile-session-terminal'

export abstract class RuntimeTerminalResolveMobileSessionTerminalCommand extends RuntimeTerminalRunCreateMobileSessionTerminal {
  protected async resolveMobileSessionTerminalCommand(
    workspace: TerminalWorkspaceLaunchScope,
    opts: {
      command?: string
      env?: Record<string, string>
      envToDelete?: string[]
      startupCommandDelivery?: WorktreeStartupLaunch['startupCommandDelivery']
      agent?: TuiAgent
      agentPrompt?: string
      launchConfig?: SleepingAgentLaunchConfig
      launchAgent?: TuiAgent
    }
  ): Promise<{
    command?: string
    env?: Record<string, string>
    envToDelete?: string[]
    startupCommandDelivery?: WorktreeStartupLaunch['startupCommandDelivery']
    launchConfig?: SleepingAgentLaunchConfig
    launchAgent?: TuiAgent
  }> {
    if (opts.command || !opts.agent) {
      return {
        command: opts.command,
        env: opts.env,
        envToDelete: opts.envToDelete,
        launchConfig: opts.launchConfig,
        launchAgent: opts.launchAgent,
        startupCommandDelivery: opts.startupCommandDelivery
      }
    }
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const settings = this.store.getSettings()
    if (!isTuiAgentEnabled(opts.agent, settings.disabledTuiAgents)) {
      throw new Error('Selected agent is disabled. Choose an enabled agent before creating.')
    }
    // Why: mobile may be running on iOS while the target runtime uses a
    // Windows, macOS, or Linux shell; quote for the host shell.
    const platform = this.getAgentLaunchPlatformForWorkspace(workspace)
    const isRemote = workspace.repo ? repoIsRemote(workspace.repo) : repoIsRemote(workspace)
    const queuedShell = resolveLocalWindowsAgentStartupShell({
      platform,
      isRemote,
      terminalWindowsShell: settings.terminalWindowsShell
    })
    const startupPlan = buildAgentStartupPlan({
      agent: opts.agent,
      prompt: opts.agentPrompt ?? '',
      cmdOverrides: settings.agentCmdOverrides ?? {},
      agentArgs: resolveTuiAgentLaunchArgs(opts.agent, settings.agentDefaultArgs),
      agentEnv: resolveTuiAgentLaunchEnv(opts.agent, settings.agentDefaultEnv),
      platform,
      shell: queuedShell,
      isRemote,
      allowEmptyPromptLaunch: true
    })
    if (!startupPlan) {
      throw new Error(`Could not build launch command for ${opts.agent}.`)
    }
    if (opts.agentPrompt && startupPlan.followupPrompt) {
      throw new Error(`Agent ${opts.agent} does not support startup prompt quick commands.`)
    }
    if (!workspace.connectionId) {
      this.markLocalWorkspaceTrustedForAgent(opts.agent, workspace.path)
    }
    return {
      command: startupPlan.launchCommand,
      env: startupPlan.env,
      envToDelete: opts.envToDelete,
      launchConfig: startupPlan.launchConfig,
      launchAgent: opts.agent,
      startupCommandDelivery: startupPlan.startupCommandDelivery
    }
  }
}
