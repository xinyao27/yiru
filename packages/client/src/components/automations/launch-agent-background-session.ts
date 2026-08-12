import { resolveLocalWindowsAgentStartupShell } from '@yiru/workbench-model/platform'
import { requestBackgroundTerminalWorktreeMount } from '~renderer/components/terminal/background-terminal-worktree-mount'
import { getAgentLaunchPlatformForRepo } from '~renderer/lib/agent-launch-platform'
import { createBrowserUuid } from '~renderer/lib/browser-uuid'
import { getLocalProjectExecutionRuntimeContext } from '~renderer/lib/local-preflight-context'
import { CLIENT_PLATFORM } from '~renderer/lib/new-workspace'
import { buildAgentStartupPlan } from '~renderer/lib/tui-agent-startup'
import { getSettingsForWorktreeRuntimeOwner } from '~renderer/lib/worktree-runtime-owner'
import { markAgentWorkspaceTrusted } from '~renderer/runtime/agent-trust-client'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import {
  subscribeToRuntimeTerminalData,
  toRuntimeTerminalPtyId
} from '~renderer/runtime/terminal-stream'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'
import { useAppStore } from '~renderer/store'
import { singlePaneLayoutSnapshot } from '~renderer/store/slices/terminal-helpers'
import { repoIsRemote } from '~shared/agent/launch-remote'
import { createAgentStatusOscProcessor } from '~shared/agent/status-osc'
import { makePaneKey } from '~shared/stable-pane-id'
import { TUI_AGENT_CONFIG } from '~shared/tui-agent/config'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '~shared/tui-agent/launch-defaults'

import { scheduleAgentBackgroundDraft } from './agent-background-draft-delivery'
import { runBestEffortAgentBackgroundCleanups } from './agent-background-session-cleanup'
import type {
  LaunchAgentBackgroundSessionArgs,
  LaunchAgentBackgroundSessionResult
} from './agent-background-session-contract'
import { retireProvider, retireUnownedTerminal } from './retire-unowned-background-terminal'

export async function launchAgentBackgroundSession(
  args: LaunchAgentBackgroundSessionArgs
): Promise<LaunchAgentBackgroundSessionResult | null> {
  const { agent, worktreeId, prompt, title, onData, onExit, onAgentStatus } = args
  const store = useAppStore.getState()
  const worktree = store.allWorktrees().find((entry) => entry.id === worktreeId)
  const repo = worktree ? store.repos.find((entry) => entry.id === worktree.repoId) : null
  if (!worktree) {
    throw new Error('The target workspace is no longer available.')
  }
  const preflight = TUI_AGENT_CONFIG[agent].preflightTrust
  if (preflight && worktree.path) {
    try {
      await markAgentWorkspaceTrusted({
        preset: preflight,
        workspacePath: worktree.path
      })
    } catch {
      // Best-effort: continue with launch. The user can still accept the trust menu.
    }
  }
  const cmdOverrides = store.settings?.agentCmdOverrides ?? {}
  const agentArgs = resolveTuiAgentLaunchArgs(agent, store.settings?.agentDefaultArgs)
  const agentEnv = resolveTuiAgentLaunchEnv(agent, store.settings?.agentDefaultEnv)
  const launchPlatform = repo
    ? getAgentLaunchPlatformForRepo(getLocalProjectExecutionRuntimeContext(store, worktreeId))
    : CLIENT_PLATFORM
  const isRemote = repo ? repoIsRemote(repo) : false
  const startupShell = resolveLocalWindowsAgentStartupShell({
    platform: launchPlatform,
    isRemote,
    terminalWindowsShell: store.settings?.terminalWindowsShell
  })
  const trimmedPrompt = prompt?.trim() ?? ''
  const hasPrompt = trimmedPrompt.length > 0
  const isFollowupPath = TUI_AGENT_CONFIG[agent].promptInjectionMode === 'stdin-after-start'

  const pasteDraftAfterLaunch = hasPrompt && isFollowupPath ? trimmedPrompt : null
  const startupPlan = buildAgentStartupPlan({
    agent,
    prompt: hasPrompt && !isFollowupPath ? trimmedPrompt : '',
    cmdOverrides,
    agentArgs,
    agentEnv,
    platform: launchPlatform,
    shell: startupShell,
    isRemote,
    allowEmptyPromptLaunch: !hasPrompt || isFollowupPath
  })
  if (!startupPlan) {
    return null
  }

  // Why: automation runs should start without revealing the workspace.
  // Spawn the PTY immediately, then attach an inactive tab to the live session.
  const tab = store.createTab(worktreeId, undefined, undefined, {
    activate: false,
    recordInteraction: false
  })
  if (title) {
    store.setTabCustomTitle(tab.id, title, { recordInteraction: false })
  }
  // Why: agent hook callbacks are keyed by pane, and background automation
  // tabs never mount a TerminalPane to inject this env for us. createBrowserUuid
  // (not crypto.randomUUID) because the latter is undefined in non-secure
  // browser contexts — the LAN web client served over plain HTTP.
  const leafId = createBrowserUuid()
  const paneKey = makePaneKey(tab.id, leafId)
  const launchToken = createBrowserUuid()
  const launchRegistration = {
    agentType: agent,
    launchToken,
    tabId: tab.id,
    leafId
  }
  store.registerAgentLaunchConfig(paneKey, startupPlan.launchConfig, launchRegistration)
  // Why: `title` labels the tab/worktree entry. Pane titles render as an
  // in-terminal title row, so background sessions must not persist it there.
  store.setTabLayout(tab.id, singlePaneLayoutSnapshot(leafId))
  const paneEnv = {
    ...startupPlan.env,
    YIRU_PANE_KEY: paneKey,
    YIRU_TAB_ID: tab.id,
    YIRU_WORKTREE_ID: worktreeId,
    YIRU_AGENT_LAUNCH_TOKEN: launchToken
  }
  // Route by the worktree's owner host, not the focused runtime.
  const runtimeTarget = getActiveRuntimeTarget(
    getSettingsForWorktreeRuntimeOwner(store, worktreeId)
  )
  let ptyId = ''
  let runtimeTerminalHandle: string | null = null
  let exitHandled = false
  let unsubscribeExit = (): void => {},
    unsubscribeData = (): void => {}
  const handleExit = (exitPtyId: string, code: number): void => {
    if (exitHandled) {
      return
    }
    exitHandled = true
    unsubscribeExit()
    unsubscribeData()
    useAppStore.getState().clearTabPtyId(tab.id, exitPtyId)
    useAppStore.getState().clearAgentLaunchConfig(paneKey)
    onExit?.(exitPtyId, code)
  }
  const processAgentStatus = createAgentStatusOscProcessor()
  const handleData = (data: string): void => {
    onData?.(data)
    const processed = processAgentStatus(data)
    for (const payload of processed.payloads) {
      useAppStore.getState().setAgentStatus(paneKey, payload, undefined, undefined, undefined, {
        launchToken
      })
      onAgentStatus?.(payload)
    }
  }
  try {
    const created = await callRuntimeOrpc(
      runtimeTarget,
      (client) => client.terminal.create,
      {
        worktree: toRuntimeWorktreeSelector(worktreeId),
        viewport: { cols: 120, rows: 40 },
        command: startupPlan.launchCommand,
        launchConfig: startupPlan.launchConfig,
        launchToken,
        launchAgent: agent,
        ...(startupPlan.startupCommandDelivery
          ? { startupCommandDelivery: startupPlan.startupCommandDelivery }
          : {}),
        env: paneEnv,
        title,
        tabId: tab.id,
        leafId,
        presentation: 'background'
      },
      { timeoutMs: 15_000 }
    )
    runtimeTerminalHandle = created.terminal.handle
    ptyId = toRuntimeTerminalPtyId(
      runtimeTerminalHandle,
      runtimeTarget.kind === 'environment' ? runtimeTarget.environmentId : null
    )
    if (
      await retireUnownedTerminal({
        tabId: tab.id,
        ptyId,
        runtimeTarget,
        runtimeTerminalHandle,
        onRetire: () => {
          exitHandled = true
          store.clearAgentLaunchConfig(paneKey)
        }
      })
    ) {
      return null
    }
    store.updateTabPtyId(tab.id, ptyId)
    store.setTabLayout(tab.id, singlePaneLayoutSnapshot(leafId, ptyId))
    if (agent === 'command-code' && hasPrompt && !isFollowupPath) {
      // Why: Command Code does not expose a prompt-start hook; seed working for
      // hidden prompt launches so sidebar/activity surfaces do not stay idle.
      store.setAgentStatus(
        paneKey,
        {
          state: 'working',
          prompt: trimmedPrompt,
          agentType: agent
        },
        undefined,
        undefined,
        undefined,
        { launchConfig: startupPlan.launchConfig, launchToken }
      )
    }

    unsubscribeData = await subscribeToRuntimeTerminalData(
      store.settings,
      ptyId,
      `desktop:background:${tab.id}`,
      handleData
    )
    void callRuntimeOrpc(
      runtimeTarget,
      (client) => client.terminal.wait,
      { terminal: runtimeTerminalHandle, for: 'exit' },
      { timeoutMs: 24 * 60 * 60 * 1000 }
    )
      .then((result) => handleExit(ptyId, result.wait.exitCode ?? 0))
      .catch(() => {})

    // Why: mount only after the explicit PTY is bound. Mounting at the earlier
    // createTab boundary lets a slow remote spawn race TerminalPane's fresh
    // spawn path and launch the agent twice.
    requestBackgroundTerminalWorktreeMount({ worktreeId, tabIds: [tab.id] })

    if (pasteDraftAfterLaunch !== null) {
      scheduleAgentBackgroundDraft(tab.id, pasteDraftAfterLaunch, agent)
    }

    return { tabId: tab.id, paneKey, ptyId, startupPlan }
  } catch (error) {
    // Why: terminal creation and stream subscription are separate remote calls.
    // A failure between them must not strand an invisible runtime terminal.
    exitHandled = true
    runBestEffortAgentBackgroundCleanups(unsubscribeExit, unsubscribeData)
    runBestEffortAgentBackgroundCleanups(() => store.clearTabPtyId(tab.id, ptyId))
    runBestEffortAgentBackgroundCleanups(() => store.clearAgentLaunchConfig(paneKey))
    if (ptyId) {
      await retireProvider({ ptyId, runtimeTarget, runtimeTerminalHandle })
    }
    // Why: a launch-failure cleanup close is not a user close — keep it out of
    // the Cmd+Shift+T reopen stack.
    runBestEffortAgentBackgroundCleanups(() =>
      store.closeTab(tab.id, { recordInteraction: false, reason: 'cleanup' })
    )
    throw error
  }
}
