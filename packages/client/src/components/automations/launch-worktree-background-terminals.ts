import { isWindowsAbsolutePathLike } from '@yiru/workbench-model/platform'
import { translate } from '~renderer/i18n/i18n'
import { createBrowserUuid } from '~renderer/lib/browser-uuid'
import { getSettingsForWorktreeRuntimeOwner } from '~renderer/lib/worktree-runtime-owner'
import { callRuntimeOrpc, type RuntimeClientTarget } from '~renderer/runtime/orpc-client'
import { getActiveRuntimeTarget } from '~renderer/runtime/rpc-client'
import { toRuntimeTerminalPtyId } from '~renderer/runtime/terminal-stream'
import { toRuntimeWorktreeSelector } from '~renderer/runtime/worktree-selector'
import { useAppStore } from '~renderer/store'
import { singlePaneLayoutSnapshot } from '~renderer/store/slices/terminal-helpers'
import { buildSetupRunnerCommand } from '~shared/setup/runner-command'
import { makePaneKey } from '~shared/stable-pane-id'
import type {
  TerminalLayoutSnapshot,
  Worktree,
  WorktreeDefaultTabsLaunch,
  WorktreeSetupLaunch
} from '~shared/types'

import { registerBackgroundTerminalBuffer } from './background-terminal-buffer'
import { retireUnownedTerminal } from './retire-unowned-background-terminal'

type BackgroundPane = {
  leafId: string
  ptyId: string
  terminal: string
}

type BackgroundTab = {
  tabId: string
  primary: BackgroundPane
}

type BackgroundTerminalLaunch = {
  command?: string
  env?: Record<string, string>
  title?: string
  color?: string
}

function getSetupTabTitle(): string {
  return translate('auto.lib.launch.worktree.background.terminals.setupTitle', 'Setup')
}

export type LaunchWorktreeBackgroundTerminalsArgs = {
  worktreeId: string
  setup?: WorktreeSetupLaunch
  defaultTabs?: WorktreeDefaultTabsLaunch
}

function buildPaneEnv(
  worktreeId: string,
  tabId: string,
  leafId: string,
  env: Record<string, string> | undefined
): Record<string, string> {
  return {
    ...env,
    YIRU_PANE_KEY: makePaneKey(tabId, leafId),
    YIRU_TAB_ID: tabId,
    YIRU_WORKTREE_ID: worktreeId
  }
}

function buildSplitLayout(
  first: BackgroundPane,
  second: BackgroundPane,
  direction: 'horizontal' | 'vertical',
  secondTitle: string
): TerminalLayoutSnapshot {
  return {
    root: {
      type: 'split',
      direction,
      first: { type: 'leaf', leafId: first.leafId },
      second: { type: 'leaf', leafId: second.leafId }
    },
    activeLeafId: first.leafId,
    expandedLeafId: null,
    ptyIdsByLeafId: {
      [first.leafId]: first.ptyId,
      [second.leafId]: second.ptyId
    },
    titlesByLeafId: {
      [second.leafId]: secondTitle
    }
  }
}

function buildSetupCommand(setup: WorktreeSetupLaunch): string {
  return buildSetupRunnerCommand(
    setup.runnerScriptPath,
    isWindowsAbsolutePathLike(setup.runnerScriptPath) ? 'windows' : 'posix'
  )
}

async function spawnPane(args: {
  worktree: Worktree
  runtimeTarget: RuntimeClientTarget
  tabId: string
  leafId: string
  command?: string
  env?: Record<string, string>
}): Promise<BackgroundPane> {
  const result = await callRuntimeOrpc(args.runtimeTarget, (client) => client.terminal.create, {
    worktree: toRuntimeWorktreeSelector(args.worktree.id),
    viewport: { cols: 120, rows: 40 },
    ...(args.command ? { command: args.command } : {}),
    env: buildPaneEnv(args.worktree.id, args.tabId, args.leafId, args.env),
    tabId: args.tabId,
    leafId: args.leafId,
    presentation: 'background'
  })
  return {
    leafId: args.leafId,
    terminal: result.terminal.handle,
    ptyId: toRuntimeTerminalPtyId(
      result.terminal.handle,
      args.runtimeTarget.kind === 'environment' ? args.runtimeTarget.environmentId : null
    )
  }
}

async function createBackgroundTab(args: {
  worktree: Worktree
  runtimeTarget: RuntimeClientTarget
  launch: BackgroundTerminalLaunch
}): Promise<BackgroundTab> {
  const store = useAppStore.getState()
  const tab = store.createTab(args.worktree.id, undefined, undefined, {
    activate: false,
    recordInteraction: false
  })
  if (args.launch.title) {
    store.setTabCustomTitle(tab.id, args.launch.title, { recordInteraction: false })
  }
  if (args.launch.color) {
    store.setTabColor(tab.id, args.launch.color)
  }

  const leafId = createBrowserUuid()
  store.setTabLayout(tab.id, singlePaneLayoutSnapshot(leafId))
  let pane: BackgroundPane
  try {
    pane = await spawnPane({
      worktree: args.worktree,
      runtimeTarget: args.runtimeTarget,
      tabId: tab.id,
      leafId,
      command: args.launch.command,
      env: args.launch.env
    })
  } catch (error) {
    store.closeTab(tab.id, { recordInteraction: false, reason: 'cleanup' })
    throw error
  }
  if (
    await retireUnownedTerminal({
      tabId: tab.id,
      ptyId: pane.ptyId,
      runtimeTarget: args.runtimeTarget,
      runtimeTerminalHandle: pane.terminal
    })
  ) {
    throw new Error('The terminal tab was closed before its session finished starting.')
  }
  store.updateTabPtyId(tab.id, pane.ptyId)
  store.setTabLayout(tab.id, singlePaneLayoutSnapshot(leafId, pane.ptyId))
  registerBackgroundTerminalBuffer({
    tabId: tab.id,
    leafId: pane.leafId,
    ptyId: pane.ptyId,
    terminal: pane.terminal,
    runtimeTarget: args.runtimeTarget
  })
  return { tabId: tab.id, primary: pane }
}

async function addSetupSplit(args: {
  worktree: Worktree
  runtimeTarget: RuntimeClientTarget
  tab: BackgroundTab
  setup: WorktreeSetupLaunch
  direction: 'horizontal' | 'vertical'
}): Promise<void> {
  const store = useAppStore.getState()
  const setupLeafId = createBrowserUuid()
  const setupPane = await spawnPane({
    worktree: args.worktree,
    runtimeTarget: args.runtimeTarget,
    tabId: args.tab.tabId,
    leafId: setupLeafId,
    command: buildSetupCommand(args.setup),
    env: args.setup.envVars
  })
  if (
    await retireUnownedTerminal({
      tabId: args.tab.tabId,
      ptyId: setupPane.ptyId,
      runtimeTarget: args.runtimeTarget,
      runtimeTerminalHandle: setupPane.terminal
    })
  ) {
    return
  }
  store.updateTabPtyId(args.tab.tabId, setupPane.ptyId)
  store.setTabLayout(
    args.tab.tabId,
    buildSplitLayout(args.tab.primary, setupPane, args.direction, getSetupTabTitle())
  )
  registerBackgroundTerminalBuffer({
    tabId: args.tab.tabId,
    leafId: setupPane.leafId,
    ptyId: setupPane.ptyId,
    terminal: setupPane.terminal,
    runtimeTarget: args.runtimeTarget
  })
}

function getDefaultTabLaunches(
  defaultTabs: WorktreeDefaultTabsLaunch | undefined
): BackgroundTerminalLaunch[] {
  return (defaultTabs?.tabs ?? []).map((tab) => {
    const command = tab.command?.trim()
    return {
      ...(tab.title ? { title: tab.title } : {}),
      ...(tab.color ? { color: tab.color } : {}),
      ...(command && defaultTabs?.runCommands ? { command } : {})
    }
  })
}

export async function launchWorktreeBackgroundTerminals(
  args: LaunchWorktreeBackgroundTerminalsArgs
): Promise<void> {
  if (!args.setup && !args.defaultTabs) {
    return
  }
  const store = useAppStore.getState()
  const runtimeTarget = getActiveRuntimeTarget(
    getSettingsForWorktreeRuntimeOwner(store, args.worktreeId)
  )
  const worktree = store.allWorktrees().find((entry) => entry.id === args.worktreeId)
  if (!worktree) {
    throw new Error('The target workspace is no longer available.')
  }
  const defaultLaunches = getDefaultTabLaunches(args.defaultTabs)
  const launchedTabs: BackgroundTab[] = []

  for (const launch of defaultLaunches) {
    try {
      launchedTabs.push(await createBackgroundTab({ worktree, runtimeTarget, launch }))
    } catch (error) {
      console.warn('[automations] Failed to launch workspace default tab:', error)
    }
  }

  const setupMode = store.settings?.setupScriptLaunchMode ?? 'new-tab'
  const shouldSplitSetup =
    args.setup && (setupMode === 'split-horizontal' || setupMode === 'split-vertical')
  if (shouldSplitSetup) {
    const primaryTab =
      launchedTabs[0] ?? (await createBackgroundTab({ worktree, runtimeTarget, launch: {} }))
    await addSetupSplit({
      worktree,
      runtimeTarget,
      tab: primaryTab,
      setup: args.setup!,
      direction: setupMode === 'split-horizontal' ? 'horizontal' : 'vertical'
    })
    return
  }

  if (args.setup) {
    if (launchedTabs.length === 0) {
      launchedTabs.push(await createBackgroundTab({ worktree, runtimeTarget, launch: {} }))
    }
    await createBackgroundTab({
      worktree,
      runtimeTarget,
      launch: {
        title: getSetupTabTitle(),
        command: buildSetupCommand(args.setup),
        env: args.setup.envVars
      }
    })
  }
}
