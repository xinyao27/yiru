import { resolveLocalWindowsAgentStartupShell } from '@yiru/runtime-protocol/model/platform'
import { repoIsRemote } from '@yiru/runtime-protocol/workbench/agent/launch-remote'
import { isTuiAgent, TUI_AGENT_CONFIG } from '@yiru/runtime-protocol/workbench/tui-agent/config'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '@yiru/runtime-protocol/workbench/tui-agent/launch-defaults'
import {
  isTuiAgentEnabled,
  pickTuiAgent
} from '@yiru/runtime-protocol/workbench/tui-agent/selection'
import {
  buildAgentDraftLaunchPlan,
  buildAgentStartupPlan
} from '@yiru/runtime-protocol/workbench/tui-agent/startup'
import type { Repo, WorktreeStartupLaunch, TuiAgent } from '@yiru/runtime-protocol/workbench/types'
import {
  markCodexProjectTrusted,
  markCopilotFolderTrusted,
  markCursorWorkspaceTrusted
} from '~main/agent-trust-presets'
import { detectInstalledAgentsWithShellPathHydration } from '~main/preflight/preflight'

import type { WorktreeStartupDraftPaste, WorktreeStartupFollowup } from '../model/terminal-startup'
import { RuntimeWorktreeWorkspaceActivation } from './workspace-activation'

export abstract class RuntimeWorktreeBuildStartupForDraft extends RuntimeWorktreeWorkspaceActivation {
  protected async buildStartupForDraft(
    repo: Repo,
    draft: string,
    requestedAgent?: TuiAgent
  ): Promise<{
    agent: TuiAgent
    startup: WorktreeStartupLaunch
    draftPaste?: WorktreeStartupDraftPaste
  } | null> {
    if (!this.store) {
      return null
    }
    const content = draft.trim()
    if (!content) {
      return null
    }
    const settings = this.store.getSettings()
    const preferredAgent = requestedAgent ?? settings.defaultTuiAgent
    if (preferredAgent === 'blank') {
      // Why: `blank` is an explicit user preference to create a shell-only
      // workspace, so linked review drafts must not auto-pick a detected agent.
      return null
    }
    let agent =
      isTuiAgent(preferredAgent) && isTuiAgentEnabled(preferredAgent, settings.disabledTuiAgents)
        ? preferredAgent
        : null
    if (!agent) {
      let detected: string[] = []
      try {
        // Why: startup-draft fallback can run from sparse runtime launch envs too.
        detected = await detectInstalledAgentsWithShellPathHydration()
      } catch {
        detected = []
      }
      const typedDetected = detected.filter(isTuiAgent)
      agent = pickTuiAgent(null, typedDetected, settings.disabledTuiAgents)
    }
    if (!agent) {
      return null
    }

    // Why: a mobile client can run on another platform. Startup command quoting
    // must target the shell that runs on this host.
    const agentLaunchPlatform = this.getAgentLaunchPlatformForRepo(repo)
    const isRemote = false
    const queuedShell = resolveLocalWindowsAgentStartupShell({
      platform: agentLaunchPlatform,
      isRemote,
      terminalWindowsShell: settings.terminalWindowsShell
    })
    const draftLaunchPlan = buildAgentDraftLaunchPlan({
      agent,
      draft: content,
      cmdOverrides: settings.agentCmdOverrides ?? {},
      agentArgs: resolveTuiAgentLaunchArgs(agent, settings.agentDefaultArgs),
      agentEnv: resolveTuiAgentLaunchEnv(agent, settings.agentDefaultEnv),
      platform: agentLaunchPlatform,
      shell: queuedShell,
      isRemote
    })
    if (draftLaunchPlan) {
      return {
        agent,
        startup: {
          command: draftLaunchPlan.launchCommand,
          launchConfig: draftLaunchPlan.launchConfig,
          ...(draftLaunchPlan.startupCommandDelivery
            ? { startupCommandDelivery: draftLaunchPlan.startupCommandDelivery }
            : {}),
          ...(draftLaunchPlan.env ? { env: draftLaunchPlan.env } : {})
        }
      }
    }

    const startupPlan = buildAgentStartupPlan({
      agent,
      prompt: '',
      cmdOverrides: settings.agentCmdOverrides ?? {},
      agentArgs: resolveTuiAgentLaunchArgs(agent, settings.agentDefaultArgs),
      agentEnv: resolveTuiAgentLaunchEnv(agent, settings.agentDefaultEnv),
      platform: agentLaunchPlatform,
      shell: queuedShell,
      isRemote,
      allowEmptyPromptLaunch: true
    })
    if (!startupPlan) {
      return null
    }
    return {
      agent,
      startup: {
        command: startupPlan.launchCommand,
        launchConfig: startupPlan.launchConfig,
        ...(startupPlan.startupCommandDelivery
          ? { startupCommandDelivery: startupPlan.startupCommandDelivery }
          : {}),
        ...(startupPlan.env ? { env: startupPlan.env } : {})
      },
      draftPaste: { agent, content }
    }
  }

  protected buildStartupForAgent(
    repo: Repo,
    agent: TuiAgent,
    prompt: string | undefined
  ): { agent: TuiAgent; startup: WorktreeStartupLaunch; followup?: WorktreeStartupFollowup } {
    if (!this.store) {
      throw new Error('runtime_unavailable')
    }
    const settings = this.store.getSettings()
    if (!isTuiAgentEnabled(agent, settings.disabledTuiAgents)) {
      throw new Error('Selected agent is disabled. Choose an enabled agent before creating.')
    }
    // Why: CLI clients may target paired runtimes from macOS or Windows, so
    // quote for the workspace shell rather than the client shell.
    const agentLaunchPlatform = this.getAgentLaunchPlatformForRepo(repo)
    const isRemote = repoIsRemote(repo)
    const queuedShell = resolveLocalWindowsAgentStartupShell({
      platform: agentLaunchPlatform,
      isRemote,
      terminalWindowsShell: settings.terminalWindowsShell
    })
    const startupPlan = buildAgentStartupPlan({
      agent,
      prompt: prompt ?? '',
      cmdOverrides: settings.agentCmdOverrides ?? {},
      agentArgs: resolveTuiAgentLaunchArgs(agent, settings.agentDefaultArgs),
      agentEnv: resolveTuiAgentLaunchEnv(agent, settings.agentDefaultEnv),
      platform: agentLaunchPlatform,
      shell: queuedShell,
      isRemote,
      allowEmptyPromptLaunch: true
    })
    if (!startupPlan) {
      throw new Error(`Could not build launch command for ${agent}.`)
    }
    return {
      agent,
      startup: {
        command: startupPlan.launchCommand,
        launchConfig: startupPlan.launchConfig,
        ...(startupPlan.startupCommandDelivery
          ? { startupCommandDelivery: startupPlan.startupCommandDelivery }
          : {}),
        ...(startupPlan.env ? { env: startupPlan.env } : {})
      },
      ...(startupPlan.followupPrompt
        ? {
            followup: {
              expectedProcess: startupPlan.expectedProcess,
              prompt: startupPlan.followupPrompt
            }
          }
        : {})
    }
  }

  protected markLocalWorkspaceTrustedForAgent(agent: TuiAgent, workspacePath: string): void {
    const preset = TUI_AGENT_CONFIG[agent].preflightTrust
    if (!preset) {
      return
    }
    try {
      if (preset === 'cursor') {
        markCursorWorkspaceTrusted(workspacePath)
      } else if (preset === 'copilot') {
        markCopilotFolderTrusted(workspacePath)
      } else if (preset === 'codex') {
        markCodexProjectTrusted(workspacePath)
      }
    } catch {
      // Best-effort: the user can still accept the agent trust prompt manually.
    }
  }
}
