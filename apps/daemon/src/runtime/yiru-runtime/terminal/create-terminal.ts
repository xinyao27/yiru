import { randomUUID } from 'node:crypto'

import { encodeRuntimePtyId } from '@yiru/runtime-protocol/terminal-identity/id'
import {
  addClaudeTeammateModeAuto,
  addClaudeTeammateModeInProcess
} from '@yiru/runtime-protocol/workbench/claude-agent-teams-tmux-compat'
import type { RuntimeTerminalCreate } from '@yiru/runtime-protocol/workbench/runtime-types'
import { SETUP_AGENT_SEQUENCE_STARTUP_COMMAND_ENV } from '@yiru/runtime-protocol/workbench/setup/agent-sequencing'
import { isTerminalLeafId, makePaneKey } from '@yiru/runtime-protocol/workbench/stable-pane-id'
import { isValidHostTerminalTabId } from '@yiru/runtime-protocol/workbench/terminal/tab-id'
import { buildClaudeAgentTeamsLaunchPlan } from '~main/runtime/claude-agent-teams-shim-env'
import { isWebShellServicesConnectionId } from '~main/runtime/rpc/orpc/shell-services-identity'
import {
  requestShellTerminalCreate,
  requestShellTerminalReveal
} from '~main/runtime/rpc/orpc/shell-services-reverse-link'

import {
  copySleepingAgentLaunchConfig,
  inferCapturedClaudeAgentTeamsMode,
  mergeTerminalEnvDeletions
} from '../model/terminal-launch'
import type { TerminalCreateOptions } from '../model/terminal-launch'
import { createTerminalRevealWarning, resolveTerminalPresentation } from '../model/terminal-startup'
import { RuntimeTerminalRenameTerminal } from './rename-terminal'

export abstract class RuntimeTerminalCreateTerminal extends RuntimeTerminalRenameTerminal {
  async createTerminal(
    worktreeSelector?: string,
    opts: TerminalCreateOptions = {}
  ): Promise<RuntimeTerminalCreate> {
    const presentation = resolveTerminalPresentation(opts)
    const requiresRendererFocus = opts.presentation === 'focused' || opts.focus === true
    const availableAuthoritativeWindow = this.getAvailableAuthoritativeWindow()
    // Why: pre-diff createTerminal fell back to the renderer's active worktree
    // when no selector was provided. The new background-spawn branch hard-
    // requires a resolvable selector, so route the no-selector case through
    // the renderer IPC path to preserve that behavior.
    const rendererWindow = opts.rendererBacked === true ? availableAuthoritativeWindow : null
    const shouldCreateInBackground =
      worktreeSelector !== undefined &&
      ((!requiresRendererFocus && opts.rendererBacked !== true) ||
        // Why: `yiru serve` exposes the local runtime without a renderer
        // window. Renderer-backed Codex terminals are preferred for the app,
        // but headless CLI users still need a usable terminal handle.
        (opts.rendererBacked === true && rendererWindow === null))

    if (shouldCreateInBackground) {
      if (!this.ptyController?.spawn) {
        throw new Error('runtime_unavailable')
      }
      const workspace = await this.resolveTerminalWorkspaceLaunchScope(worktreeSelector)
      const launchOpts = await this.resolveAgentTerminalCreateOptions(workspace, opts)
      const cwd =
        this.resolveWorkspaceTerminalStartupCwd(workspace, launchOpts.cwd) ?? workspace.path
      const preAllocatedHandle = this.createPreAllocatedTerminalHandle()
      // Why: mint tabId in main before spawn so paneKey is known at PTY env
      // build time. Hook-based agent status (Claude/Codex/Cursor/Gemini) keys
      // off `${tabId}:${leafId}` — without these vars set on the PTY, the
      // hook payload arrives with an empty paneKey and the renderer cannot
      // attribute the event. Use a stable UUID leaf because hooks reject the
      // legacy numeric pane keys after the pane-id migration.
      const hintedTabId = launchOpts.tabId?.trim()
      const canAdoptPaneIdentity =
        hintedTabId !== undefined &&
        isValidHostTerminalTabId(hintedTabId) &&
        launchOpts.leafId !== undefined &&
        isTerminalLeafId(launchOpts.leafId)
      const tabId = canAdoptPaneIdentity ? (hintedTabId as string) : randomUUID()
      const leafId = canAdoptPaneIdentity ? (launchOpts.leafId as string) : randomUUID()
      const paneKey = makePaneKey(tabId, leafId)
      const launchToken = launchOpts.launchConfig
        ? (launchOpts.launchToken ?? randomUUID())
        : undefined
      const baseEnv = {
        ...launchOpts.env,
        ...(launchToken ? { YIRU_AGENT_LAUNCH_TOKEN: launchToken } : {})
      }
      const claudeAgentTeamsSourceCommand =
        launchOpts.claudeAgentTeamsSourceCommand?.trim() || launchOpts.command?.trim() || undefined
      const claudeAgentTeamsMode = this.store?.getSettings?.().claudeAgentTeamsMode
      const effectiveClaudeAgentTeamsMode = inferCapturedClaudeAgentTeamsMode(
        launchOpts.launchConfig,
        claudeAgentTeamsSourceCommand,
        claudeAgentTeamsMode
      )
      const agentTeamsPlan = await buildClaudeAgentTeamsLaunchPlan({
        command: claudeAgentTeamsSourceCommand,
        mode: effectiveClaudeAgentTeamsMode,
        baseEnv: {
          ...process.env,
          ...baseEnv
        },
        createTeamEnv: (shimDir, shimBin) =>
          this.claudeAgentTeams.createLaunchEnv({
            leaderHandle: preAllocatedHandle,
            baseEnv: {
              ...process.env,
              ...baseEnv
            },
            shimDir,
            shimBin
          }).env
      })
      const sequencedStartupCommand =
        agentTeamsPlan &&
        claudeAgentTeamsSourceCommand &&
        launchOpts.command &&
        claudeAgentTeamsSourceCommand !== launchOpts.command
          ? agentTeamsPlan.command
          : undefined
      const effectiveLaunchConfig =
        launchOpts.launchConfig && agentTeamsPlan
          ? {
              ...launchOpts.launchConfig,
              agentCommand: launchOpts.launchConfig.agentCommand
                ? effectiveClaudeAgentTeamsMode === 'in-process' || process.platform === 'win32'
                  ? addClaudeTeammateModeInProcess(launchOpts.launchConfig.agentCommand)
                  : addClaudeTeammateModeAuto(launchOpts.launchConfig.agentCommand)
                : agentTeamsPlan.command,
              agentEnv: {
                ...launchOpts.launchConfig.agentEnv,
                ...agentTeamsPlan.env
              }
            }
          : launchOpts.launchConfig
      // Why: setup/agent sequencing wraps the PTY launch in a wait shell before
      // Claude Agent Teams runs. Preserve the direct Claude command separately
      // so the wrapper can exec the teammate-mode variant after setup completes.
      const env = this.buildTerminalWorkspaceEnv(
        workspace,
        {
          ...baseEnv,
          ...(sequencedStartupCommand
            ? { [SETUP_AGENT_SEQUENCE_STARTUP_COMMAND_ENV]: sequencedStartupCommand }
            : {})
        },
        paneKey,
        tabId,
        agentTeamsPlan?.env
      )
      await launchOpts.beforeSpawn?.()
      const result = await this.ptyController.spawn({
        cols: launchOpts.cols ?? 120,
        rows: launchOpts.rows ?? 40,
        cwd,
        cwdFallback: launchOpts.cwdFallback,
        command: sequencedStartupCommand
          ? launchOpts.command
          : (agentTeamsPlan?.command ?? launchOpts.command),
        launchAgent: launchOpts.launchAgent,
        commandDelivery: 'provider',
        startupCommandDelivery: launchOpts.startupCommandDelivery,
        env,
        envToDelete: mergeTerminalEnvDeletions(launchOpts.envToDelete, agentTeamsPlan?.envToDelete),
        telemetry: launchOpts.telemetry,
        connectionId: workspace.connectionId,
        worktreeId: workspace.id,
        preAllocatedHandle,
        tabId,
        leafId,
        ...(launchOpts.sessionId ? { sessionId: launchOpts.sessionId } : {}),
        // Why: a headless-created pane has no renderer session writer. Persist
        // its tab/leaf binding at spawn so a later promoted window reattaches
        // the live daemon or SSH PTY instead of replacing it with a fresh one.
        // Re-check freshly: the entry-time snapshot can go stale across the
        // awaits above if the authoritative window is destroyed mid-spawn.
        ...(launchOpts.persistHostSessionBinding || this.getAvailableAuthoritativeWindow() === null
          ? { persistHostSessionBinding: true }
          : {})
      })
      this.registerPreAllocatedHandleForPty(result.id, preAllocatedHandle)
      this.registerPty(result.id, workspace.id, workspace.connectionId)
      const pty = this.getOrCreatePtyWorktreeRecord(result.id)
      if (pty) {
        if (launchOpts.title) {
          const observedAt = this.nextTitleObservationSequence()
          pty.title = launchOpts.title
          pty.titleUpdatedAt = observedAt
          this.setPtyManagementTitleFromObservedTitle(pty, launchOpts.title, observedAt)
        } else {
          pty.title = null
          pty.titleUpdatedAt = null
        }
        pty.tabId = tabId
        pty.paneKey = paneKey
        pty.launchConfig = effectiveLaunchConfig
          ? copySleepingAgentLaunchConfig(effectiveLaunchConfig)
          : null
        pty.launchToken = launchToken ?? null
        pty.launchAgent = launchOpts.launchAgent ?? null
        this.terminalSessions.commitPtyState(pty.ptyId, { pty })
      }
      const handle = pty ? this.issuePtyHandle(pty) : preAllocatedHandle
      if (pty && launchOpts.deferMobileSessionPublish !== true) {
        this.publishPtyBackedMobileSessionTerminal(workspace.id, pty, {
          tabId,
          leafId,
          title: launchOpts.title ?? null,
          activate: presentation === 'focused',
          // Why: explicit background presentation may carry legacy activate
          // metadata from an already-owned renderer pane; don't select it on mobile.
          selectIfNoActiveTab: presentation !== 'background',
          ...(cwd !== workspace.path ? { startupCwd: cwd } : {})
        })
      }
      let surface: RuntimeTerminalCreate['surface'] = 'background'
      let warning: string | undefined
      if (presentation !== 'background' && this.shellConnectionId) {
        try {
          // Why: after the PTY is spawned, renderer tab adoption is best-effort;
          // failing here must not strand a live process without returning a handle.
          // Pass the pre-minted tabId so the renderer adopts under the same id
          // already baked into the PTY env — keeps paneKey hook attribution intact.
          const revealResult = await requestShellTerminalReveal(this.shellConnectionId, {
            worktreeId: workspace.id,
            // Why: the shell's attach/store path requires the canonical
            // `runtime:` wire shape, never the bare controller handle.
            ptyId: encodeRuntimePtyId(handle),
            durablePtyId: result.id,
            title: launchOpts.title ?? null,
            ...(cwd !== workspace.path ? { cwd } : {}),
            ...(effectiveLaunchConfig ? { launchConfig: effectiveLaunchConfig } : {}),
            ...(launchToken ? { launchToken } : {}),
            ...(launchOpts.launchAgent ? { launchAgent: launchOpts.launchAgent } : {}),
            activate: presentation === 'focused',
            ...(presentation ? { presentation } : {}),
            tabId,
            leafId,
            ...(isWebShellServicesConnectionId(this.shellConnectionId)
              ? { source: 'runtime-session' as const }
              : {})
          })
          if (!revealResult.ok) {
            throw new Error('renderer_unavailable')
          }
          surface = 'visible'
        } catch (err) {
          console.warn(`[terminal-create] failed to create inactive tab for ${result.id}:`, err)
          warning = createTerminalRevealWarning(handle, err)
        }
      } else if (presentation !== 'background') {
        warning = createTerminalRevealWarning(handle)
      }
      return {
        handle,
        tabId,
        paneKey,
        ptyId: result.id,
        worktreeId: workspace.id,
        title: launchOpts.title ?? null,
        surface,
        transportGeneration: this.getTerminalTransportGeneration(result.id),
        isReattach: false,
        sessionExpired: false,
        restore: {
          kind: 'none',
          isAlternateScreen: false,
          ...(result.startupCwdFallback ? { startupCwdFallback: result.startupCwdFallback } : {})
        },
        ...(warning ? { warning } : {})
      }
    }

    this.assertGraphReady()
    // Why: renderer-owned terminal creation needs an active reverse-link shell;
    // headless runtime callers use the PTY-owned branch above instead.
    if (!this.shellConnectionId) {
      throw new Error('No renderer window available')
    }
    // Why: mirrors browserTabCreate — when no worktree is specified, pass
    // undefined so the renderer uses its current active worktree.
    const workspace = worktreeSelector
      ? await this.resolveTerminalWorkspaceLaunchScope(worktreeSelector)
      : null
    const launchOpts = workspace
      ? await this.resolveAgentTerminalCreateOptions(workspace, opts)
      : opts
    const worktreeId = workspace?.id
    const cwd = workspace
      ? this.resolveWorkspaceTerminalStartupCwd(workspace, launchOpts.cwd)
      : launchOpts.cwd

    // Why: terminal creation is a renderer-side Zustand store operation (like
    // browser tab creation). The main process asks the renderer to create the
    // tab and return the tabId so we can resolve the handle.
    await launchOpts.beforeSpawn?.()
    const reply = await requestShellTerminalCreate(this.shellConnectionId, {
      worktreeId,
      command: launchOpts.command,
      cwd,
      ...(launchOpts.env ? { env: launchOpts.env } : {}),
      ...(launchOpts.envToDelete ? { envToDelete: launchOpts.envToDelete } : {}),
      ...(launchOpts.launchConfig ? { launchConfig: launchOpts.launchConfig } : {}),
      ...(launchOpts.launchToken ? { launchToken: launchOpts.launchToken } : {}),
      ...(launchOpts.launchAgent ? { launchAgent: launchOpts.launchAgent } : {}),
      startupCommandDelivery: launchOpts.startupCommandDelivery,
      title: launchOpts.title,
      activate: presentation === 'focused',
      ...(presentation ? { presentation } : {})
    })
    if (!reply.ok) {
      throw new Error('renderer_unavailable')
    }

    // Why: the renderer created the tab immediately, but the graph sync that
    // publishing the authority graph may not have arrived yet. Wait for the leaf to
    // appear so we can return a valid handle the caller can use right away.
    const handle = await this.waitForTerminalHandle(reply.tabId)
    const createdPtyId = this.resolveLiveLeafForHandle(handle)?.ptyId ?? null
    return {
      handle,
      tabId: reply.tabId,
      ptyId: createdPtyId,
      worktreeId: worktreeId ?? '',
      title: reply.title,
      surface: 'visible',
      transportGeneration: createdPtyId
        ? this.getTerminalTransportGeneration(createdPtyId)
        : randomUUID(),
      isReattach: false,
      sessionExpired: false,
      restore: { kind: 'none', isAlternateScreen: false }
    }
  }
}
