import type { SleepingAgentLaunchConfig } from '@yiru/workbench-model/agent'
import { requestShellTerminalCreate } from '~main/runtime/rpc/orpc/shell-services-reverse-link'
import type { RuntimeMobileSessionCreateTerminalResult } from '~shared/runtime-types'
import type { WorktreeStartupLaunch, TuiAgent } from '~shared/types'

import {
  MOBILE_TERMINAL_READY_FALLBACK_MS,
  MOBILE_TERMINAL_SURFACE_TIMEOUT_MS,
  isClientDisconnectedError
} from '../model/terminal-startup'
import { RuntimeTerminalLaunchAgentTerminal } from './launch-agent-terminal'

export abstract class RuntimeTerminalRunCreateMobileSessionTerminal extends RuntimeTerminalLaunchAgentTerminal {
  protected async runCreateMobileSessionTerminal(
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
    this.assertGraphReady()
    const workspace = await this.resolveTerminalWorkspaceLaunchScope(worktreeSelector)
    const worktreeId = workspace.id
    const cwd = this.resolveWorkspaceTerminalStartupCwd(workspace, opts.cwd)
    this.hydrateHeadlessMobileSessionTabsFromWorkspaceSession(worktreeId)
    let afterDesktopTabId: string | undefined
    if (opts.afterTabId) {
      const snapshot = this.mobileSessionTabsByWorktree.get(worktreeId)
      const anchor = snapshot?.tabs.find((tab) => tab.id === opts.afterTabId)
      if (!anchor) {
        throw new Error('after_tab_not_found')
      }
      afterDesktopTabId = anchor.type === 'terminal' ? anchor.parentTabId : anchor.id
    }
    const startupCommand = await this.resolveMobileSessionTerminalCommand(workspace, opts)

    // Why: without a paired shell, mobile terminal creation remains host-owned.
    if (!this.shellConnectionId) {
      return await this.createHeadlessMobileSessionTerminal(
        worktreeId,
        opts.activate !== false,
        opts.afterTabId,
        {
          command: startupCommand.command,
          cwd,
          env: startupCommand.env,
          envToDelete: startupCommand.envToDelete,
          startupCommandDelivery: startupCommand.startupCommandDelivery,
          launchAgent: startupCommand.launchAgent,
          targetGroupId: opts.targetGroupId,
          launchConfig: startupCommand.launchConfig
        }
      )
    }
    // Why: a dead client connection cancels the wait immediately; the
    // renderer tab (and its shell) stays alive for the host and mirrors on
    // reconnect (#7718) — requestShellTerminalCreate normalizes an abort of
    // this signal to the `client_disconnected` message below.
    const reply = await requestShellTerminalCreate(
      this.shellConnectionId,
      {
        worktreeId,
        afterTabId: afterDesktopTabId,
        targetGroupId: opts.targetGroupId,
        command: startupCommand.command,
        cwd,
        ...(startupCommand.env ? { env: startupCommand.env } : {}),
        ...(startupCommand.envToDelete ? { envToDelete: startupCommand.envToDelete } : {}),
        ...(startupCommand.launchConfig ? { launchConfig: startupCommand.launchConfig } : {}),
        ...(startupCommand.launchAgent ? { launchAgent: startupCommand.launchAgent } : {}),
        startupCommandDelivery: startupCommand.startupCommandDelivery,
        source: 'runtime-session',
        activate: opts.activate
      },
      { signal: opts.signal }
    )

    if (!reply.ok) {
      throw new Error('renderer_unavailable')
    }

    if (opts.activate !== false) {
      this.dispatchShellCommand({
        type: 'focusTerminal',
        tabId: reply.tabId,
        worktreeId,
        leafId: null
      })
    }
    // Why: register the wait before the renderer's PTY spawn arrives so that
    // spawn (registerPty) can publish the pty-backed surface main-side even if
    // graph-sync is stalled (#7587). Removed in the finally below.
    const pendingCreateKey = `${worktreeId}::${reply.tabId}`
    // Why: a rescue publishes into the active group (opts.targetGroupId is not
    // threaded); the renderer's reconciling publication then moves the tab to the
    // requested group, so any wrong-group placement is cosmetic and stall-window-only.
    this.pendingMobileTerminalCreatesByKey.set(pendingCreateKey, {
      activate: opts.activate !== false,
      selectIfNoActiveTab: true
    })
    try {
      // Why: the PTY spawn and the tabCreate reply race on independent IPC
      // channels; if the spawn already registered, publish immediately so the
      // wait resolves without depending on a graph sync.
      this.ensurePtyBackedMobileSurfaceForRendererTab(worktreeId, reply.tabId)
      const surface = await this.waitForMobileTerminalSurface(worktreeId, reply.tabId, {
        timeoutMs: MOBILE_TERMINAL_SURFACE_TIMEOUT_MS,
        signal: opts.signal
      })
      if (this.isReadyMobileTerminalSurface(surface)) {
        return surface
      }
      const readySurface = await this.waitForMobileTerminalSurface(worktreeId, reply.tabId, {
        timeoutMs: MOBILE_TERMINAL_READY_FALLBACK_MS,
        requireReady: true,
        signal: opts.signal
      }).catch(() => null)
      if (readySurface) {
        return readySurface
      }
      if (opts.signal?.aborted) {
        // Why: nobody is waiting for this create anymore; do not materialize
        // or roll back — the renderer's own publication settles the tab.
        throw new Error('client_disconnected')
      }
      const pendingSurface = this.findMobileTerminalSurface(worktreeId, reply.tabId)
      if (!pendingSurface) {
        throw new Error('Timed out waiting for terminal surface after creation')
      }
      // Why: hidden/occluded renderer windows can publish the tab shell before
      // TerminalPane mounts and spawns the PTY. Materialize into the same
      // identity so later renderer focus adopts instead of creating another tab.
      return await this.createHeadlessMobileSessionTerminal(
        worktreeId,
        opts.activate !== false,
        opts.afterTabId,
        {
          command: startupCommand.command,
          cwd,
          env: startupCommand.env,
          envToDelete: startupCommand.envToDelete,
          startupCommandDelivery: startupCommand.startupCommandDelivery,
          identity: { tabId: pendingSurface.tab.parentTabId, leafId: pendingSurface.tab.leafId },
          launchAgent: startupCommand.launchAgent,
          targetGroupId: opts.targetGroupId,
          launchConfig: startupCommand.launchConfig
        }
      )
    } catch (error) {
      // Why: publication latency (throttled/hidden renderer), not spawn failure,
      // can trip the surface timeout. Rescue only when a live PTY actually backs
      // the tab — gating on a surface would let a handle-less shell (or a failed
      // materialize) resolve as success and skip the ghost-tab rollback (#7587).
      if (this.findLiveRegisteredPtyForRendererTab(worktreeId, reply.tabId)) {
        const rescued = this.ensurePtyBackedMobileSurfaceForRendererTab(worktreeId, reply.tabId)
        if (rescued) {
          return rescued
        }
      }
      // Why: don't roll back when (a) the client connection died — the wait
      // was cancelled, not the spawn — or (b) a live shell already backs the
      // tab (its pane key may simply not be registered yet). Killing a real
      // terminal the host user can see is the "tab dies after ~10s" bug (#7718).
      if (
        isClientDisconnectedError(error) ||
        this.hasLiveShellForRendererTab(worktreeId, reply.tabId)
      ) {
        throw error
      }
      // Why: the renderer created the tab but no live PTY backs it (true PTY
      // spawn/handle failure). Roll the half-created tab back via the renderer
      // close path so it can't linger as a ghost in mobile snapshots, then
      // surface the failure to the caller.
      this.dispatchShellCommand({ type: 'closeTerminal', tabId: reply.tabId })
      throw error
    } finally {
      this.pendingMobileTerminalCreatesByKey.delete(pendingCreateKey)
    }
  }
}
