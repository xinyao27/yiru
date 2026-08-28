import type { RuntimeMobileSessionTabMove } from '@yiru/runtime-protocol/workbench/runtime-types'

import { useAppStore } from '../store/state'
import { callRuntimeOrpc } from './orpc-client'
import { resolveWebRuntimeSessionEnvironmentId } from './web-runtime-session-environment'
import { recordWebSessionCloseIntent } from './web-session/close-intent'
import { closeWebSessionTabCommand } from './web-session/commands'
import { recordWebSessionReorderIntent } from './web-session/reorder-intent'
import { requestWebSessionTabsRefresh } from './web-session/tabs-refresh-requests'
import { isWebTerminalSurfaceTabId, toHostSessionTabId } from './web-terminal-surface-id'
import { toRuntimeWorktreeSelector } from './worktree-selector'

type WebRuntimeSessionTabArgs = {
  worktreeId: string
  tabId: string
  environmentId?: string | null
}

export async function activateWebRuntimeSessionWorktree(args: {
  worktreeId: string
  environmentId?: string | null
  notifyDesktop?: boolean
}): Promise<boolean> {
  const environmentId = resolveWebRuntimeSessionEnvironmentId(args.environmentId)
  if (!environmentId) {
    return false
  }
  try {
    await callRuntimeOrpc(
      { kind: 'environment', environmentId },
      (client) => client.worktree.activate,
      {
        worktree: toRuntimeWorktreeSelector(args.worktreeId),
        notifyClients: args.notifyDesktop !== false
      },
      { timeoutMs: 15_000 }
    )
    return true
  } catch (error) {
    logWebRuntimeSessionFailure('activate worktree', error)
    return false
  }
}

export function activateWebRuntimeSessionTab(args: WebRuntimeSessionTabArgs): Promise<boolean> {
  return callWebRuntimeSessionTabMethod('activate', args)
}

export function closeWebRuntimeSessionTab(args: WebRuntimeSessionTabArgs): Promise<boolean> {
  return callWebRuntimeSessionTabMethod('close', args)
}

export async function moveWebRuntimeSessionTab(
  args: RuntimeMobileSessionTabMove & {
    worktreeId: string
    environmentId?: string | null
  }
): Promise<boolean> {
  const environmentId = resolveWebRuntimeSessionEnvironmentId(args.environmentId)
  if (!environmentId) {
    return false
  }
  if (args.kind === 'reorder') {
    // Why: hold the local intent before host-ID resolution so an older
    // in-flight snapshot cannot snap the tab back.
    recordWebSessionReorderIntent(args.worktreeId, args.targetGroupId, args.tabOrder, Date.now())
  }
  try {
    const { resolveHostSessionTabIdForWebSessionTab } = await import('./web-session/tabs-tracking')
    const state = useAppStore.getState()
    const resolveHostBackedTabId = (tabId: string): string | null =>
      resolveHostSessionTabIdForWebSessionTab(state, {
        environmentId,
        worktreeId: args.worktreeId,
        tabId
      }) ?? (isWebTerminalSurfaceTabId(tabId) ? toHostSessionTabId(tabId) : null)
    const movedHostTabId =
      args.kind === 'reorder'
        ? resolveHostBackedTabId(args.tabId)
        : (resolveHostBackedTabId(args.tabId) ?? args.tabId)
    if (!movedHostTabId) {
      return false
    }
    const reorderedHostTabOrder =
      args.kind === 'reorder'
        ? args.tabOrder
            .map(resolveHostBackedTabId)
            .filter((tabId): tabId is string => Boolean(tabId))
        : null
    if (reorderedHostTabOrder && !reorderedHostTabOrder.includes(movedHostTabId)) {
      return false
    }
    const targetHostIndex = resolveTargetHostIndex(args, state, resolveHostBackedTabId)
    const base = {
      worktree: toRuntimeWorktreeSelector(args.worktreeId),
      tabId: movedHostTabId,
      targetGroupId: args.targetGroupId
    }
    const move =
      args.kind === 'reorder'
        ? { ...base, kind: 'reorder' as const, tabOrder: reorderedHostTabOrder ?? [] }
        : args.kind === 'split'
          ? { ...base, kind: 'split' as const, splitDirection: args.splitDirection }
          : { ...base, kind: 'move-to-group' as const, index: targetHostIndex }
    await callRuntimeOrpc(
      { kind: 'environment', environmentId },
      (client) => client.session.tabs.move,
      move,
      { timeoutMs: 15_000 }
    )
    return true
  } catch (error) {
    logWebRuntimeSessionFailure('move tab', error)
    return false
  }
}

async function callWebRuntimeSessionTabMethod(
  method: 'activate' | 'close',
  args: WebRuntimeSessionTabArgs
): Promise<boolean> {
  const environmentId = resolveWebRuntimeSessionEnvironmentId(args.environmentId)
  if (!environmentId) {
    return false
  }
  if (method === 'close') {
    // Why: record before the async host-ID import; otherwise an older snapshot
    // can re-materialize the locally closed mirror in that gap.
    recordWebSessionCloseIntent(args.worktreeId, toHostSessionTabId(args.tabId), Date.now())
  }
  try {
    const { resolveHostSessionTabIdForWebSessionTab } = await import('./web-session/tabs-tracking')
    const hostTabId =
      resolveHostSessionTabIdForWebSessionTab(useAppStore.getState(), {
        environmentId,
        worktreeId: args.worktreeId,
        tabId: args.tabId
      }) ?? toHostSessionTabId(args.tabId)
    if (method === 'close') {
      recordWebSessionCloseIntent(args.worktreeId, hostTabId, Date.now())
      const result = await closeWebSessionTabCommand({
        environmentId,
        worktreeId: args.worktreeId,
        tabId: hostTabId
      })
      if (result.status === 'failed') {
        throw result.error
      }
      await requestWebSessionTabsRefresh({ environmentId, worktreeId: args.worktreeId })
      return true
    }
    await callRuntimeOrpc(
      { kind: 'environment', environmentId },
      (client) => client.session.tabs.activate,
      { worktree: toRuntimeWorktreeSelector(args.worktreeId), tabId: hostTabId },
      { timeoutMs: 15_000 }
    )
    return true
  } catch (error) {
    logWebRuntimeSessionFailure(`${method} tab`, error)
    return false
  }
}

function resolveTargetHostIndex(
  args: RuntimeMobileSessionTabMove & { worktreeId: string },
  state: ReturnType<typeof useAppStore.getState>,
  resolveHostBackedTabId: (tabId: string) => string | null
): number | undefined {
  if (args.kind !== 'move-to-group' || typeof args.index !== 'number') {
    return args.kind === 'move-to-group' ? args.index : undefined
  }
  // Why: web groups may contain local-only tabs, so the host insertion index
  // counts only the filtered host-backed order.
  return (
    state.groupsByWorktree[args.worktreeId]
      ?.find((group) => group.id === args.targetGroupId)
      ?.tabOrder.slice(0, args.index)
      .map(resolveHostBackedTabId)
      .filter((tabId): tabId is string => Boolean(tabId)).length ?? args.index
  )
}

function logWebRuntimeSessionFailure(action: string, error: unknown): void {
  console.warn(
    `[web-runtime-session] failed to ${action}:`,
    error instanceof Error ? error.message : String(error)
  )
}
