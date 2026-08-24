import type { SleepingAgentLaunchConfig } from '@yiru/workbench-model/agent'
import type { StartupCommandDelivery } from '~shared/codex-startup-delivery'
import type { RuntimeMobileSessionCreateTerminalResult } from '~shared/runtime-types'
import type { TuiAgent } from '~shared/types'

import { deliverLaunchPromptToAgentTab } from '../lib/agent-launch-prompt-delivery'
import { useAppStore } from '../store'
import type { AppState } from '../store/types'
import { resolveWebRuntimeSessionEnvironmentId } from './web-runtime-session-environment'
import {
  createWebSessionBrowserTabCommand,
  createWebSessionTerminalCommand
} from './web-session-commands'
import { requestWebSessionTabsRefresh } from './web-session-tabs-refresh-requests'
import { toWebTerminalSurfaceTabId } from './web-terminal-surface-id'

type CreateWebRuntimeSessionTerminalArgs = {
  worktreeId: string
  environmentId?: string | null
  afterTabId?: string
  targetGroupId?: string
  command?: string
  cwd?: string
  env?: Record<string, string>
  envToDelete?: string[]
  startupCommandDelivery?: StartupCommandDelivery
  launchConfig?: SleepingAgentLaunchConfig
  agent?: TuiAgent
  launchAgent?: TuiAgent
  activate?: boolean
  selectWorktree?: boolean
}

type CreatedWebRuntimeSessionTerminal = {
  terminal: RuntimeMobileSessionCreateTerminalResult['tab']
}

export async function createWebRuntimeSessionTerminal(
  args: CreateWebRuntimeSessionTerminalArgs
): Promise<boolean> {
  return Boolean(await createWebRuntimeSessionTerminalResult(args))
}

export async function createWebRuntimeAgentSessionTerminal(
  args: CreateWebRuntimeSessionTerminalArgs & {
    agent: TuiAgent
    promptAfterReady: string
    submitPrompt: boolean
    forcePromptPaste: boolean
  }
): Promise<{ created: boolean; promptDelivered: boolean }> {
  const created = await createWebRuntimeSessionTerminalResult(args)
  if (!created) {
    return { created: false, promptDelivered: false }
  }
  const promptDelivered = await deliverLaunchPromptToAgentTab({
    tabId: toWebTerminalSurfaceTabId(created.terminal.parentTabId),
    content: args.promptAfterReady,
    agent: args.agent,
    submit: args.submitPrompt,
    forcePaste: args.forcePromptPaste
  })
  return { created: true, promptDelivered }
}

async function createWebRuntimeSessionTerminalResult(
  args: CreateWebRuntimeSessionTerminalArgs
): Promise<CreatedWebRuntimeSessionTerminal | null> {
  const environmentId = resolveWebRuntimeSessionEnvironmentId(args.environmentId)
  if (!environmentId) {
    return null
  }
  if (args.selectWorktree !== false) {
    selectWebRuntimeSessionWorktree(args.worktreeId)
  }
  const result = await createWebSessionTerminalCommand({ ...args, environmentId })
  if (result.status === 'failed') {
    console.warn(
      '[web-runtime-session] failed to create terminal:',
      result.error instanceof Error ? result.error.message : String(result.error)
    )
    return null
  }
  await requestWebSessionTabsRefresh({ environmentId, worktreeId: args.worktreeId })
  return { terminal: result.value.tab }
}

export async function createWebRuntimeSessionBrowserTab(args: {
  worktreeId: string
  environmentId?: string | null
  url?: string
  profileId?: string | null
  targetGroupId?: string
  selectWorktree?: boolean
}): Promise<boolean> {
  const environmentId = resolveWebRuntimeSessionEnvironmentId(args.environmentId)
  if (!environmentId) {
    return false
  }
  const shouldSelectWorktree = args.selectWorktree !== false
  const stagedFromWorktreeId = useAppStore.getState().activeWorktreeId
  if (shouldSelectWorktree) {
    selectWebRuntimeSessionWorktree(args.worktreeId)
  }
  const result = await createWebSessionBrowserTabCommand({
    environmentId,
    worktreeId: args.worktreeId,
    url: args.url,
    profileId: args.profileId,
    targetGroupId: args.targetGroupId
  })
  if (result.status === 'failed') {
    console.warn(
      '[web-runtime-session] failed to create browser tab:',
      result.error instanceof Error ? result.error.message : String(result.error)
    )
    return false
  }
  stageWebRuntimeBrowserTab({
    environmentId,
    worktreeId: args.worktreeId,
    remotePageId: result.value.browserPageId,
    url: args.url,
    targetGroupId: args.targetGroupId,
    restoreFocus:
      shouldSelectWorktree &&
      (stagedFromWorktreeId === args.worktreeId ||
        useAppStore.getState().activeWorktreeId === args.worktreeId)
  })
  void requestWebSessionTabsRefresh({ environmentId, worktreeId: args.worktreeId })
  return true
}

function stageWebRuntimeBrowserTab(args: {
  environmentId: string
  worktreeId: string
  remotePageId: string
  url?: string
  targetGroupId?: string
  restoreFocus?: boolean
}): void {
  const remotePageId = args.remotePageId.trim()
  if (!remotePageId) {
    return
  }
  const existing = findLocalBrowserPageForRemotePage(
    useAppStore.getState(),
    args.environmentId,
    remotePageId
  )
  if (args.restoreFocus !== false) {
    selectWebRuntimeSessionWorktree(args.worktreeId)
  }
  if (existing) {
    if (args.restoreFocus !== false) {
      useAppStore
        .getState()
        .focusBrowserTabInWorktree(args.worktreeId, existing.pageId, { surfacePane: true })
    }
    return
  }
  const url = args.url?.trim() || 'about:blank'
  // Why: stage the host handle before the asynchronous snapshot arrives so
  // React never renders a fallback workspace for the selected worktree.
  const browserTab = useAppStore.getState().createBrowserTab(args.worktreeId, url, {
    title: url === 'about:blank' ? 'New Browser Tab' : url,
    focusAddressBar: true,
    pageId: remotePageId,
    browserRuntimeEnvironmentId: args.environmentId,
    targetGroupId: args.targetGroupId
  })
  const pageId = browserTab.activePageId ?? browserTab.pageIds?.[0] ?? null
  if (pageId) {
    useAppStore.getState().setRemoteBrowserPageHandle(pageId, {
      environmentId: args.environmentId,
      remotePageId
    })
  }
}

function selectWebRuntimeSessionWorktree(worktreeId: string): void {
  useAppStore.getState().setActiveWorktree(worktreeId)
}

function findLocalBrowserPageForRemotePage(
  state: AppState,
  environmentId: string,
  remotePageId: string
): { pageId: string } | null {
  for (const pages of Object.values(state.browserPagesByWorkspace)) {
    for (const page of pages) {
      const handle = state.remoteBrowserPageHandlesByPageId[page.id]
      if (handle?.environmentId === environmentId && handle.remotePageId === remotePageId) {
        return { pageId: page.id }
      }
    }
  }
  return null
}
