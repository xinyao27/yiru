import { resolveLocalWindowsAgentStartupShell } from '@yiru/runtime-protocol/model/platform'
import { repoIsRemote } from '@yiru/runtime-protocol/workbench/agent/launch-remote'
import type { RuntimeTerminalRename } from '@yiru/runtime-protocol/workbench/runtime-types'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '@yiru/runtime-protocol/workbench/tui-agent/launch-defaults'
import { buildAgentStartupPlan } from '@yiru/runtime-protocol/workbench/tui-agent/startup'

import { resolveBareAgentLaunchCommand } from '../model/terminal-launch'
import type { TerminalCreateOptions } from '../model/terminal-launch'
import type { TerminalWorkspaceLaunchScope } from '../model/worktree-resolution'
import { RuntimeWorktreeForceDeletePreservedBranch } from '../worktree/force-delete-preserved-branch'

export abstract class RuntimeTerminalRenameTerminal extends RuntimeWorktreeForceDeletePreservedBranch {
  async renameTerminal(handle: string, title: string | null): Promise<RuntimeTerminalRename> {
    const pty = this.getLivePtyForHandle(handle)
    if (pty) {
      pty.pty.title = title
      // Why: a manual rename must outrank later agent OSC title updates (which
      // win by timestamp), so stamp it as the freshest title.
      pty.pty.titleUpdatedAt = Date.now()
      this.terminalSessions.commitPtyState(pty.pty.ptyId, { pty: pty.pty })
      this.touchMobileSessionSnapshotsForPty(pty.pty.ptyId)
      // Why: without a renderer the rename only lived on the live pty and was
      // lost on restart. Persist customTitle so a headless rebuild keeps it.
      for (const leaf of this.terminalSessions.listGraphLeaves()) {
        if (leaf.ptyId === pty.pty.ptyId) {
          if (!this.dispatchShellCommand({ type: 'renameTerminal', tabId: leaf.tabId, title })) {
            this.persistHeadlessTerminalTitle(pty.pty.worktreeId, leaf.tabId, title)
          }
          return { handle, tabId: leaf.tabId, title }
        }
      }
      if (pty.pty.tabId) {
        if (!this.dispatchShellCommand({ type: 'renameTerminal', tabId: pty.pty.tabId, title })) {
          this.persistHeadlessTerminalTitle(pty.pty.worktreeId, pty.pty.tabId, title)
        }
      }
      return { handle, tabId: pty.pty.tabId ?? pty.record.tabId, title }
    }
    this.assertGraphReady()
    const { leaf } = this.getLiveLeafForHandle(handle)
    this.dispatchShellCommand({ type: 'renameTerminal', tabId: leaf.tabId, title })
    return { handle, tabId: leaf.tabId, title }
  }

  protected async resolveAgentTerminalCreateOptions(
    workspace: TerminalWorkspaceLaunchScope,
    opts: TerminalCreateOptions
  ): Promise<TerminalCreateOptions> {
    // Why: raw shell commands like `codex exec` must remain user-authored shell.
    // Only unmanaged, repo-backed, bare agent launches get Settings defaults.
    if (
      !opts.command ||
      opts.env ||
      opts.launchConfig ||
      opts.launchAgent ||
      opts.startupCommandDelivery ||
      opts.claudeAgentTeamsSourceCommand ||
      !workspace.repo ||
      !this.store
    ) {
      return opts
    }

    const settings = this.store.getSettings()
    const platform = this.getAgentLaunchPlatformForWorkspace(workspace)
    const isRemote = repoIsRemote(workspace.repo)
    const queuedShell = resolveLocalWindowsAgentStartupShell({
      platform,
      isRemote,
      terminalWindowsShell: settings.terminalWindowsShell
    })
    const agent = resolveBareAgentLaunchCommand({
      command: opts.command,
      settings,
      platform,
      isRemote
    })
    if (!agent) {
      return opts
    }

    const startupPlan = buildAgentStartupPlan({
      agent,
      prompt: '',
      cmdOverrides: settings.agentCmdOverrides ?? {},
      agentArgs: resolveTuiAgentLaunchArgs(agent, settings.agentDefaultArgs),
      agentEnv: resolveTuiAgentLaunchEnv(agent, settings.agentDefaultEnv),
      platform,
      shell: queuedShell,
      isRemote,
      allowEmptyPromptLaunch: true
    })
    if (!startupPlan) {
      return opts
    }

    await opts.beforeAgentTrust?.()
    if (!workspace.connectionId) {
      this.markLocalWorkspaceTrustedForAgent(agent, workspace.path)
    }

    return {
      ...opts,
      command: startupPlan.launchCommand,
      ...(startupPlan.env ? { env: startupPlan.env } : {}),
      launchConfig: startupPlan.launchConfig,
      launchAgent: agent,
      startupCommandDelivery: startupPlan.startupCommandDelivery
    }
  }
}
