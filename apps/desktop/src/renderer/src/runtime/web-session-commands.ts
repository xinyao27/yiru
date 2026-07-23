import type { SleepingAgentLaunchConfig } from '../../../shared/agent-session-resume'
import type { StartupCommandDelivery } from '../../../shared/codex-startup-delivery'
import type { RuntimeRpcResponse } from '../../../shared/runtime-rpc-envelope'
import type {
  BrowserTabCreateResult,
  RuntimeMobileSessionCreateTerminalResult
} from '../../../shared/runtime-types'
import type { TuiAgent } from '../../../shared/types'
import { unwrapRuntimeRpcResult } from './runtime-rpc-client'
import { toRuntimeWorktreeSelector } from './runtime-worktree-selector'
import { recordWebSessionCloseIntent } from './web-session-close-intent'
import { recordWebSessionFocusIntent } from './web-session-focus-intent'
import { isWebTerminalSurfaceTabId, toHostSessionTabId } from './web-terminal-surface-id'

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
  startupCommandDelivery?: StartupCommandDelivery
  launchConfig?: SleepingAgentLaunchConfig
  agent?: TuiAgent
  launchAgent?: TuiAgent
  viewMode?: 'terminal' | 'chat'
  activate?: boolean
}): Promise<WebSessionCommandResult<RuntimeMobileSessionCreateTerminalResult>> {
  try {
    const response = await window.api.runtimeEnvironments.call({
      selector: args.environmentId,
      method: 'session.tabs.createTerminal',
      params: {
        worktree: toRuntimeWorktreeSelector(args.worktreeId),
        afterTabId: args.afterTabId ? toHostSessionTabId(args.afterTabId) : undefined,
        targetGroupId: args.targetGroupId,
        command: args.command,
        cwd: args.cwd,
        ...(args.env ? { env: args.env } : {}),
        startupCommandDelivery: args.startupCommandDelivery,
        ...(args.launchConfig ? { launchConfig: args.launchConfig } : {}),
        agent: args.agent,
        ...(args.launchAgent ? { launchAgent: args.launchAgent } : {}),
        ...(args.viewMode ? { viewMode: args.viewMode } : {}),
        activate: args.activate !== false
      },
      timeoutMs: 15_000
    })
    const value = unwrapRuntimeRpcResult(
      response as RuntimeRpcResponse<RuntimeMobileSessionCreateTerminalResult>
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
  environmentId: string
  worktreeId: string
  url?: string
  profileId?: string | null
  targetGroupId?: string
}): Promise<WebSessionCommandResult<BrowserTabCreateResult>> {
  try {
    const response = await window.api.runtimeEnvironments.call({
      selector: args.environmentId,
      method: 'browser.tabCreate',
      params: {
        worktree: toRuntimeWorktreeSelector(args.worktreeId),
        url: args.url,
        profileId: args.profileId ?? undefined,
        activate: true,
        ...(args.targetGroupId ? { targetGroupId: args.targetGroupId } : {}),
        // Why: paired clients stage the local mirror while the host webview registers.
        waitForRegistration: false
      },
      timeoutMs: 15_000
    })
    const value = unwrapRuntimeRpcResult(response as RuntimeRpcResponse<BrowserTabCreateResult>)
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
  viewMode?: 'terminal' | 'chat'
}): void {
  const hostTabId = isWebTerminalSurfaceTabId(args.tabId)
    ? toHostSessionTabId(args.tabId)
    : args.tabId
  void window.api.runtimeEnvironments
    .call({
      selector: args.environmentId,
      method: 'session.tabs.setTabProps',
      params: {
        worktree: toRuntimeWorktreeSelector(args.worktreeId),
        tabId: hostTabId,
        ...(args.color !== undefined ? { color: args.color } : {}),
        ...(args.isPinned !== undefined ? { isPinned: args.isPinned } : {}),
        ...(args.viewMode !== undefined ? { viewMode: args.viewMode } : {})
      },
      timeoutMs: 15_000
    })
    .then((response) => {
      unwrapRuntimeRpcResult(response as RuntimeRpcResponse<{ updated: true }>)
    })
    .catch((error) => {
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
    const response = await window.api.runtimeEnvironments.call({
      selector: args.environmentId,
      method: 'session.tabs.close',
      params: { worktree: toRuntimeWorktreeSelector(args.worktreeId), tabId: hostTabId },
      timeoutMs: 15_000
    })
    return {
      status: 'completed',
      value: unwrapRuntimeRpcResult(response as RuntimeRpcResponse<unknown>)
    }
  } catch (error) {
    return { status: 'failed', error }
  }
}
