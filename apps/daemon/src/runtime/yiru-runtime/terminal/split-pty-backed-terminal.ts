import { randomUUID } from 'node:crypto'

import { encodeRuntimePtyId } from '@yiru/runtime-protocol/terminal-identity/id'
import type { TerminalPaneSplitSource } from '@yiru/runtime-protocol/workbench/feature-education-telemetry'
import type {
  RuntimeTerminalClose,
  RuntimeTerminalSplit
} from '@yiru/runtime-protocol/workbench/runtime-types'
import { makePaneKey, parsePaneKey } from '@yiru/runtime-protocol/workbench/stable-pane-id'
import type {
  AgentTeamsTmuxCompatRequest,
  AgentTeamsTmuxCompatResponse
} from '~main/runtime/claude-agent-teams-service'
import {
  ensureClaudeAgentTeamsShimDir,
  resolveClaudeAgentTeamsShimBin
} from '~main/runtime/claude-agent-teams-shim-env'
import { isWebShellServicesConnectionId } from '~main/runtime/rpc/orpc/shell-services-identity'
import { requestShellTerminalReveal } from '~main/runtime/rpc/orpc/shell-services-reverse-link'

import type { RuntimePtyWorktreeRecord } from '../model/terminal-records'
import { RuntimeTerminalWaitForLeafPtyId } from './wait-for-leaf-pty-id'

export abstract class RuntimeTerminalSplitPtyBackedTerminal extends RuntimeTerminalWaitForLeafPtyId {
  async closeTerminal(handle: string): Promise<RuntimeTerminalClose> {
    const pty = this.getLivePtyForHandle(handle)
    this.claudeAgentTeams.removeTeamForLeaderHandle(handle)
    if (pty) {
      const ptyKilled = this.ptyController?.kill(pty.pty.ptyId) ?? false
      return { handle, tabId: pty.pty.tabId ?? pty.record.tabId, ptyKilled }
    }
    this.assertGraphReady()
    const { leaf } = this.getLiveLeafForHandle(handle)
    const ptyKilled = leaf.ptyId ? (this.ptyController?.kill(leaf.ptyId) ?? false) : false
    // Why: killing a PTY already closes its pane. A second shell close races
    // that exit handler and can close the remaining pane in a split tab.
    if (!ptyKilled || this.countLeavesInTab(leaf.tabId) <= 1) {
      this.dispatchShellCommand({
        type: 'closeTerminal',
        tabId: leaf.tabId,
        paneRuntimeId: leaf.paneRuntimeId
      })
    }
    return { handle, tabId: leaf.tabId, ptyKilled }
  }

  async closeTerminalTab(handle: string): Promise<RuntimeTerminalClose> {
    const pty = this.getLivePtyForHandle(handle)
    if (pty) {
      const tabId = pty.pty.tabId
      if (!tabId) {
        throw new Error('terminal_tab_not_found')
      }
      await this.closeMobileSessionTab(`id:${pty.pty.worktreeId}`, tabId)
      this.claudeAgentTeams.removeTeamForLeaderHandle(handle)
      return { handle, tabId, closeMode: 'tab', ptyKilled: false }
    }
    this.assertGraphReady()
    const { leaf } = this.getLiveLeafForHandle(handle)
    await this.closeMobileSessionTab(`id:${leaf.worktreeId}`, leaf.tabId)
    this.claudeAgentTeams.removeTeamForLeaderHandle(handle)
    return { handle, tabId: leaf.tabId, closeMode: 'tab', ptyKilled: false }
  }

  async splitTerminal(
    handle: string,
    opts: {
      direction?: 'horizontal' | 'vertical'
      command?: string
      env?: Record<string, string>
      envToDelete?: string[]
      activate?: boolean
      telemetrySource?: TerminalPaneSplitSource
    } = {}
  ): Promise<RuntimeTerminalSplit> {
    const livePty = this.getLivePtyForHandle(handle)
    if (livePty) {
      return await this.splitPtyBackedTerminal(livePty.pty, opts)
    }
    this.assertGraphReady()
    const { leaf } = this.getLiveLeafForHandle(handle)
    const direction = opts.direction ?? 'horizontal'
    const leafKeysBefore = new Set<string>()
    for (const candidate of this.terminalSessions.listGraphLeaves()) {
      if (candidate.tabId === leaf.tabId) {
        leafKeysBefore.add(this.getLeafKey(candidate.tabId, candidate.leafId))
      }
    }
    if (
      !this.dispatchShellCommand({
        type: 'splitTerminal',
        tabId: leaf.tabId,
        paneRuntimeId: leaf.paneRuntimeId,
        direction,
        command: opts.command,
        telemetrySource: opts.telemetrySource
      })
    ) {
      throw new Error('renderer_unavailable')
    }
    const newHandle = await this.waitForNewLeafInTab(leaf.tabId, leafKeysBefore)
    return { handle: newHandle, tabId: leaf.tabId, paneRuntimeId: leaf.paneRuntimeId }
  }

  protected async splitPtyBackedTerminal(
    pty: RuntimePtyWorktreeRecord,
    opts: {
      direction?: 'horizontal' | 'vertical'
      command?: string
      env?: Record<string, string>
      envToDelete?: string[]
      activate?: boolean
      telemetrySource?: TerminalPaneSplitSource
    } = {}
  ): Promise<RuntimeTerminalSplit> {
    if (!this.ptyController?.spawn) {
      throw new Error('runtime_unavailable')
    }
    if (!pty.connected) {
      throw new Error('terminal_exited')
    }
    const parsedPaneKey = parsePaneKey(pty.paneKey ?? '')
    const parentTabId = pty.tabId?.trim()
    if (!parentTabId || !parsedPaneKey) {
      throw new Error('terminal_handle_stale')
    }
    const direction = opts.direction ?? 'horizontal'
    const workspace = await this.resolveTerminalWorkspaceLaunchScope(`id:${pty.worktreeId}`)
    const leafId = randomUUID()
    const preAllocatedHandle = this.createPreAllocatedTerminalHandle()
    const paneKey = makePaneKey(parentTabId, leafId)
    const result = await this.ptyController.spawn({
      cols: 120,
      rows: 40,
      cwd: workspace.path,
      command: opts.command,
      commandDelivery: 'provider',
      env: this.buildTerminalWorkspaceEnv(workspace, opts.env ?? {}, paneKey, parentTabId),
      envToDelete: opts.envToDelete,
      connectionId: workspace.connectionId,
      worktreeId: workspace.id,
      preAllocatedHandle
    })
    this.registerPreAllocatedHandleForPty(result.id, preAllocatedHandle)
    this.registerPty(result.id, workspace.id, workspace.connectionId)
    const createdPty = this.getOrCreatePtyWorktreeRecord(result.id)
    if (createdPty) {
      createdPty.tabId = parentTabId
      createdPty.paneKey = paneKey
      this.terminalSessions.commitPtyState(createdPty.ptyId, { pty: createdPty })
    }

    try {
      if (!this.shellConnectionId) {
        throw new Error('renderer_unavailable')
      }
      const revealResult = await requestShellTerminalReveal(this.shellConnectionId, {
        worktreeId: workspace.id,
        // Why: shell adoption requires the canonical `runtime:` wire shape.
        ptyId: encodeRuntimePtyId(preAllocatedHandle),
        durablePtyId: result.id,
        title: null,
        activate: opts.activate !== false,
        tabId: parentTabId,
        leafId,
        splitFromLeafId: parsedPaneKey.leafId,
        splitDirection: direction,
        splitTelemetrySource: opts.telemetrySource,
        ...(isWebShellServicesConnectionId(this.shellConnectionId)
          ? { source: 'runtime-session' as const }
          : {})
      })
      if (!revealResult.ok) {
        throw new Error('renderer_unavailable')
      }
    } catch (error) {
      this.ptyController.kill?.(result.id)
      throw error
    }
    if (createdPty) {
      this.publishPtyBackedMobileSessionTerminal(workspace.id, createdPty, {
        tabId: parentTabId,
        leafId,
        title: null,
        activate: opts.activate !== false,
        split: { splitFromLeafId: parsedPaneKey.leafId, direction }
      })
      // Why: persist the split into the workspace session so a later snapshot
      // rebuild keeps it instead of collapsing back to a single pane.
      this.persistHeadlessTerminalSplit({
        tabId: parentTabId,
        leafId,
        ptyId: createdPty.ptyId,
        splitFromLeafId: parsedPaneKey.leafId,
        direction
      })
    }

    return { handle: this.issuePtyHandle(createdPty ?? pty), tabId: parentTabId, paneRuntimeId: -1 }
  }

  async handleAgentTeamsTmuxCompat(
    request: AgentTeamsTmuxCompatRequest
  ): Promise<AgentTeamsTmuxCompatResponse> {
    return await this.claudeAgentTeams.handleTmuxCompat(request, {
      splitTerminal: (handle, opts) => this.splitTerminal(handle, opts),
      readTerminal: (handle, opts) => this.readTerminal(handle, opts),
      sendTerminal: (handle, action) => this.sendTerminal(handle, action),
      focusTerminal: (handle) => this.focusTerminal(handle),
      closeTerminal: (handle) => this.closeTerminal(handle),
      showTerminal: (handle) => this.showTerminal(handle)
    })
  }

  async prepareClaudeAgentTeamsLeader(args: {
    paneKey: string
    baseEnv?: Record<string, string>
  }): Promise<{ env: Record<string, string> }> {
    const handle = this.getTerminalHandleForPaneKey(args.paneKey)
    if (!handle) {
      throw new Error('claude_agent_teams_requires_yiru_terminal')
    }
    return await this.prepareClaudeAgentTeamsLeaderForHandle({
      handle,
      baseEnv: args.baseEnv
    })
  }

  async prepareClaudeAgentTeamsLeaderForHandle(args: {
    handle: string
    baseEnv?: Record<string, string>
  }): Promise<{ env: Record<string, string> }> {
    const baseEnv = {
      ...process.env,
      ...args.baseEnv
    }
    const shimDir = await ensureClaudeAgentTeamsShimDir()
    const shimBin = resolveClaudeAgentTeamsShimBin(baseEnv)
    return this.claudeAgentTeams.createLaunchEnv({
      leaderHandle: args.handle,
      baseEnv,
      shimDir,
      shimBin
    })
  }

  protected waitForNewLeafInTab(
    tabId: string,
    existingLeafKeys: Set<string>,
    timeoutMs = 10_000
  ): Promise<string> {
    const tryResolve = (): string | null => {
      for (const leaf of this.terminalSessions.listGraphLeaves()) {
        const key = this.getLeafKey(leaf.tabId, leaf.leafId)
        if (leaf.tabId === tabId && !existingLeafKeys.has(key) && leaf.ptyId !== null) {
          return this.issueHandle(leaf)
        }
      }
      return null
    }

    const existing = tryResolve()
    if (existing) {
      return Promise.resolve(existing)
    }

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.terminalSessions.removeGraphSyncCallback(check)
        reject(new Error('Timed out waiting for split pane handle'))
      }, timeoutMs)

      const check = (): void => {
        const handle = tryResolve()
        if (handle) {
          clearTimeout(timer)
          this.terminalSessions.removeGraphSyncCallback(check)
          resolve(handle)
        }
      }
      this.terminalSessions.addGraphSyncCallback(check)
      check()
    })
  }
}
