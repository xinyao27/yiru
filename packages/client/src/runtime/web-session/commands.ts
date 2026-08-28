import type { SleepingAgentLaunchConfig } from '@yiru/runtime-protocol/model/agent'
import type { StartupCommandDelivery } from '@yiru/runtime-protocol/workbench/codex-startup-delivery'
import type {
  BrowserTabCreateResult,
  RuntimeMobileSessionCreateTerminalResult
} from '@yiru/runtime-protocol/workbench/runtime-types'
import type { TuiAgent } from '@yiru/runtime-protocol/workbench/types'

import { callRuntimeOrpc } from '../orpc-client'
import { isWebTerminalSurfaceTabId, toHostSessionTabId } from '../web-terminal-surface-id'
import { toRuntimeWorktreeSelector } from '../worktree-selector'
import { recordWebSessionCloseIntent } from './close-intent'
import { recordWebSessionFocusIntent } from './focus-intent'

export type WebSessionCommandResult<T> =
  | { status: 'completed'; value: T }
  | { status: 'failed'; error: unknown }

export async function createWebSessionTerminalCommand(args: {
  environmentId: string
  worktreeId: string
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
}): Promise<WebSessionCommandResult<RuntimeMobileSessionCreateTerminalResult>> {
  try {
    const value = await callRuntimeOrpc(
      { kind: 'environment', environmentId: args.environmentId },
      (client) => client.session.tabs.createTerminal,
      {
        worktree: toRuntimeWorktreeSelector(args.worktreeId),
        afterTabId: args.afterTabId ? toHostSessionTabId(args.afterTabId) : undefined,
        targetGroupId: args.targetGroupId,
        command: args.command,
        cwd: args.cwd,
        ...(args.env ? { env: args.env } : {}),
        ...(args.envToDelete ? { envToDelete: args.envToDelete } : {}),
        startupCommandDelivery: args.startupCommandDelivery,
        ...(args.launchConfig ? { launchConfig: args.launchConfig } : {}),
        agent: args.agent,
        ...(args.launchAgent ? { launchAgent: args.launchAgent } : {}),
        activate: args.activate !== false
      },
      { timeoutMs: 15_000 }
    )
    if (args.activate !== false) {
      recordWebSessionFocusIntent(args.worktreeId, value.tab.id)
    }
    return { status: 'completed', value }
  } catch (error) {
    return { status: 'failed', error }
  }
}

export async function createWebSessionBrowserTabCommand(args: {
  browserPageId?: string
  environmentId: string
  worktreeId: string
  url?: string
  profileId?: string | null
  targetGroupId?: string
}): Promise<WebSessionCommandResult<BrowserTabCreateResult>> {
  try {
    // Why: dispatches by contract path through the negotiated oRPC client
    // instead of the compatibility bridge with a bare method
    // string — the bare-string channel skips capability negotiation and
    // always lands on the legacy dispatcher, which no longer serves domains
    // retired from it (see docs/runtime-orpc-migration.md Phase 6 D-stage).
    const value = await callRuntimeOrpc(
      { kind: 'environment', environmentId: args.environmentId },
      (client) => client.browser.tabCreate,
      {
        browserPageId: args.browserPageId,
        worktree: toRuntimeWorktreeSelector(args.worktreeId),
        url: args.url,
        profileId: args.profileId ?? undefined,
        activate: true,
        ...(args.targetGroupId ? { targetGroupId: args.targetGroupId } : {}),
        // Why: paired clients stage the local mirror while the host webview registers.
        waitForRegistration: false
      },
      { timeoutMs: 15_000 }
    )
    recordWebSessionFocusIntent(args.worktreeId, value.browserPageId)
    return { status: 'completed', value }
  } catch (error) {
    return { status: 'failed', error }
  }
}

export function setWebSessionTabPropsCommand(args: {
  environmentId: string
  worktreeId: string
  tabId: string
  color?: string | null
  isPinned?: boolean
}): void {
  const hostTabId = isWebTerminalSurfaceTabId(args.tabId)
    ? toHostSessionTabId(args.tabId)
    : args.tabId
  void callRuntimeOrpc(
    { kind: 'environment', environmentId: args.environmentId },
    (client) => client.session.tabs.setTabProps,
    {
      worktree: toRuntimeWorktreeSelector(args.worktreeId),
      tabId: hostTabId,
      ...(args.color !== undefined ? { color: args.color } : {}),
      ...(args.isPinned !== undefined ? { isPinned: args.isPinned } : {})
    },
    { timeoutMs: 15_000 }
  ).catch((error) => {
    console.warn(
      '[web-session-command] failed to set tab props:',
      error instanceof Error ? error.message : String(error)
    )
  })
}

export async function closeWebSessionTabCommand(args: {
  environmentId: string
  worktreeId: string
  tabId: string
}): Promise<WebSessionCommandResult<unknown>> {
  const hostTabId = isWebTerminalSurfaceTabId(args.tabId)
    ? toHostSessionTabId(args.tabId)
    : args.tabId
  recordWebSessionCloseIntent(args.worktreeId, hostTabId, Date.now())
  try {
    const value = await callRuntimeOrpc(
      { kind: 'environment', environmentId: args.environmentId },
      (client) => client.session.tabs.close,
      { worktree: toRuntimeWorktreeSelector(args.worktreeId), tabId: hostTabId },
      { timeoutMs: 15_000 }
    )
    return { status: 'completed', value }
  } catch (error) {
    return { status: 'failed', error }
  }
}
