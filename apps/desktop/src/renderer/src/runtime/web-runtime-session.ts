/* eslint-disable max-lines */
import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import type { SleepingAgentLaunchConfig } from '@yiru/workbench-model/agent'

import type { StartupCommandDelivery } from '../../../shared/codex-startup-delivery'
import type { TerminalPaneSplitSource } from '../../../shared/feature-education-telemetry'
import type {
  RuntimeMobileSessionCreateTerminalResult,
  RuntimeMobileSessionTabMove,
  RuntimeMobileSessionTabMoveResult,
  RuntimeTerminalClose,
  RuntimeTerminalSplit
} from '../../../shared/runtime-types'
import type { TerminalPaneLayoutNode, TuiAgent } from '../../../shared/types'
import { deliverLaunchPromptToAgentTab } from '../lib/agent-launch-prompt-delivery'
import { getRuntimeEnvironmentIdForWorktree } from '../lib/worktree-runtime-owner'
import { useAppStore } from '../store'
import type { AppState } from '../store/types'
import { unwrapRuntimeRpcResult } from './runtime-rpc-client'
import { parseRemoteRuntimePtyId } from './runtime-terminal-stream'
import { toRuntimeWorktreeSelector } from './runtime-worktree-selector'
import { recordWebSessionCloseIntent } from './web-session-close-intent'
import {
  closeWebSessionTabCommand,
  createWebSessionBrowserTabCommand,
  createWebSessionTerminalCommand
} from './web-session-commands'
import { recordWebSessionReorderIntent } from './web-session-reorder-intent'
import { requestWebSessionTabsRefresh } from './web-session-tabs-refresh-requests'
import {
  isWebTerminalSurfaceTabId,
  toHostSessionTabId,
  toWebTerminalSurfaceTabId
} from './web-terminal-surface-id'

export {
  HOST_TERMINAL_SURFACE_SEPARATOR,
  isWebTerminalSurfaceTabId,
  toHostSessionTabId,
  toWebTerminalSurfaceTabId,
  WEB_TERMINAL_SURFACE_TAB_PREFIX
} from './web-terminal-surface-id'

export function isWebRuntimeSessionActive(
  activeRuntimeEnvironmentId: string | null | undefined
): boolean {
  // Why: headless serve sessions are owned by the remote runtime, regardless
  // of whether the attaching client is web or desktop Electron.
  return Boolean(activeRuntimeEnvironmentId?.trim())
}

const pendingWebRuntimeSplitMirrorTelemetry = new Map<string, Set<string>>()
const WEB_RUNTIME_SPLIT_MIRROR_SUPPRESSION_TTL_MS = 30_000
let pendingWebRuntimeSplitMirrorTelemetryId = 0

type CreateWebRuntimeSessionTerminalArgs = {
  worktreeId: string
  environmentId?: string | null
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
  const environmentId =
    args.environmentId?.trim() ??
    useAppStore.getState().settings?.activeRuntimeEnvironmentId?.trim() ??
    null
  if (!environmentId || !isWebRuntimeSessionActive(environmentId)) {
    return null
  }

  if (args.selectWorktree !== false) {
    selectWebRuntimeSessionWorktree(args.worktreeId)
  }
  const result = await createWebSessionTerminalCommand({
    ...args,
    environmentId
  })
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
  const environmentId =
    args.environmentId?.trim() ??
    useAppStore.getState().settings?.activeRuntimeEnvironmentId?.trim() ??
    null
  if (!environmentId || !isWebRuntimeSessionActive(environmentId)) {
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
  // Why: paired web browser tabs are host-owned, but the session snapshot can
  // arrive after React has already rendered a fallback workspace. Stage the
  // remote handle immediately so the current worktree stays selected.
  const browserTab = useAppStore.getState().createBrowserTab(args.worktreeId, url, {
    title: url === 'about:blank' ? 'New Browser Tab' : url,
    focusAddressBar: true,
    browserRuntimeEnvironmentId: args.environmentId,
    targetGroupId: args.targetGroupId
  })
  const pageId = browserTab.activePageId ?? browserTab.pageIds?.[0] ?? null
  if (!pageId) {
    return
  }
  useAppStore.getState().setRemoteBrowserPageHandle(pageId, {
    environmentId: args.environmentId,
    remotePageId
  })
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

export async function activateWebRuntimeSessionWorktree(args: {
  worktreeId: string
  environmentId?: string | null
  notifyDesktop?: boolean
}): Promise<boolean> {
  const environmentId =
    args.environmentId?.trim() ??
    useAppStore.getState().settings?.activeRuntimeEnvironmentId?.trim() ??
    null
  if (!environmentId || !isWebRuntimeSessionActive(environmentId)) {
    return false
  }

  try {
    const response = await window.api.runtimeEnvironments.call({
      selector: environmentId,
      method: 'worktree.activate',
      params: {
        worktree: toRuntimeWorktreeSelector(args.worktreeId),
        notifyClients: args.notifyDesktop !== false
      },
      timeoutMs: 15_000
    })
    unwrapRuntimeRpcResult(response as RuntimeRpcResponse<unknown>)
    return true
  } catch (error) {
    console.warn(
      '[web-runtime-session] failed to activate worktree:',
      error instanceof Error ? error.message : String(error)
    )
    return false
  }
}

export async function activateWebRuntimeSessionTab(args: {
  worktreeId: string
  tabId: string
  environmentId?: string | null
}): Promise<boolean> {
  return callWebRuntimeSessionTabMethod('session.tabs.activate', args)
}

export async function closeWebRuntimeSessionTab(args: {
  worktreeId: string
  tabId: string
  environmentId?: string | null
}): Promise<boolean> {
  return callWebRuntimeSessionTabMethod('session.tabs.close', args)
}

export async function moveWebRuntimeSessionTab(
  args: RuntimeMobileSessionTabMove & {
    worktreeId: string
    environmentId?: string | null
  }
): Promise<boolean> {
  const environmentId =
    args.environmentId?.trim() ??
    useAppStore.getState().settings?.activeRuntimeEnvironmentId?.trim() ??
    null
  if (!environmentId || !isWebRuntimeSessionActive(environmentId)) {
    return false
  }

  if (args.kind === 'reorder') {
    // Why: record the intended LOCAL order synchronously, before the async host
    // resolution below, so an in-flight pre-move snapshot carrying the old order
    // can't snap the tab back. The reconcile applies this until the host echoes
    // the new order. (tabOrder here is already local unified tab ids.)
    recordWebSessionReorderIntent(args.worktreeId, args.targetGroupId, args.tabOrder, Date.now())
  }

  try {
    const { resolveHostSessionTabIdForWebSessionTab } = await import('./web-session-tabs-sync')
    const state = useAppStore.getState()
    const resolveHostBackedTabId = (tabId: string): string | null =>
      resolveHostSessionTabIdForWebSessionTab(state, {
        environmentId,
        worktreeId: args.worktreeId,
        tabId
      }) ?? (isWebTerminalSurfaceTabId(tabId) ? toHostSessionTabId(tabId) : null)
    const toHostTabId = (tabId: string): string => resolveHostBackedTabId(tabId) ?? tabId
    const movedHostTabId =
      args.kind === 'reorder' ? resolveHostBackedTabId(args.tabId) : toHostTabId(args.tabId)
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
    const targetHostIndex =
      args.kind === 'move-to-group' && typeof args.index === 'number'
        ? (state.groupsByWorktree?.[args.worktreeId]
            ?.find((group) => group.id === args.targetGroupId)
            ?.tabOrder.slice(0, args.index)
            .map(resolveHostBackedTabId)
            .filter((tabId): tabId is string => Boolean(tabId)).length ?? args.index)
        : args.kind === 'move-to-group'
          ? args.index
          : undefined
    const base = {
      worktree: toRuntimeWorktreeSelector(args.worktreeId),
      tabId: movedHostTabId,
      targetGroupId: args.targetGroupId
    }
    const move =
      args.kind === 'reorder'
        ? {
            ...base,
            kind: 'reorder' as const,
            // Why: paired web groups can contain local-only tabs alongside
            // host-mirrored tabs. The host reorder API only accepts host tab
            // ids, so local ids must be omitted from the mirrored order.
            tabOrder: reorderedHostTabOrder
          }
        : args.kind === 'split'
          ? {
              ...base,
              kind: 'split' as const,
              splitDirection: args.splitDirection
            }
          : {
              ...base,
              kind: 'move-to-group' as const,
              // Why: web groups can contain local-only tabs. Host insertion
              // indexes must be counted in the filtered host-backed order.
              index: targetHostIndex
            }
    const response = await window.api.runtimeEnvironments.call({
      selector: environmentId,
      method: 'session.tabs.move',
      params: move,
      timeoutMs: 15_000
    })
    unwrapRuntimeRpcResult(response as RuntimeRpcResponse<RuntimeMobileSessionTabMoveResult>)
    return true
  } catch (error) {
    console.warn(
      '[web-runtime-session] failed to move tab:',
      error instanceof Error ? error.message : String(error)
    )
    return false
  }
}

async function callWebRuntimeSessionTabMethod(
  method: 'session.tabs.activate' | 'session.tabs.close',
  args: {
    worktreeId: string
    tabId: string
    environmentId?: string | null
  }
): Promise<boolean> {
  const environmentId =
    args.environmentId?.trim() ??
    useAppStore.getState().settings?.activeRuntimeEnvironmentId?.trim() ??
    null
  if (!environmentId || !isWebRuntimeSessionActive(environmentId)) {
    return false
  }

  if (method === 'session.tabs.close') {
    // Why: the caller prunes the local mirror synchronously, but the precise
    // host id resolution below sits behind an async import. A host snapshot
    // published in that gap would re-materialize the just-closed tab before any
    // intent exists to suppress it (the immediate "flash back"). Record a
    // best-effort intent synchronously now — the resolved-id record below then
    // covers any id the static decode couldn't recover.
    recordWebSessionCloseIntent(args.worktreeId, toHostSessionTabId(args.tabId), Date.now())
  }

  try {
    const { resolveHostSessionTabIdForWebSessionTab } = await import('./web-session-tabs-sync')
    const state = useAppStore.getState()
    const hostTabId =
      resolveHostSessionTabIdForWebSessionTab(state, {
        environmentId,
        worktreeId: args.worktreeId,
        tabId: args.tabId
      }) ?? toHostSessionTabId(args.tabId)
    if (method === 'session.tabs.close') {
      // Why: the local mirror is pruned before this resolves, so suppress this
      // host tab in the reconcile until the host snapshot confirms removal —
      // otherwise an in-flight pre-close snapshot makes the tab flash back.
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
    const response = await window.api.runtimeEnvironments.call({
      selector: environmentId,
      method,
      params: {
        worktree: toRuntimeWorktreeSelector(args.worktreeId),
        tabId: hostTabId
      },
      timeoutMs: 15_000
    })
    unwrapRuntimeRpcResult(response as RuntimeRpcResponse<unknown>)
    return true
  } catch (error) {
    console.warn(
      `[web-runtime-session] failed to ${method === 'session.tabs.close' ? 'close' : 'activate'} tab:`,
      error instanceof Error ? error.message : String(error)
    )
    return false
  }
}

export function splitWebRuntimeTerminal(
  ptyId: string | null | undefined,
  direction: 'horizontal' | 'vertical',
  telemetrySource: TerminalPaneSplitSource
): boolean {
  if (!ptyId) {
    return false
  }
  const remote = parseRemoteRuntimePtyId(ptyId)
  const environmentId = remote?.environmentId?.trim()
  if (!remote || !environmentId || !isWebRuntimeSessionActive(environmentId)) {
    return false
  }

  // Why: split requests from the paired web client must run on the host pane.
  // A local split would mint a web-only pane and the host would mirror it back
  // as a separate tab instead of preserving the terminal split layout.
  const pendingMirrorSuppressionId = reservePendingWebRuntimeSplitMirrorTelemetry(ptyId, direction)
  const releasePendingMirrorSuppression = schedulePendingWebRuntimeSplitMirrorTelemetryRelease(
    ptyId,
    direction,
    pendingMirrorSuppressionId
  )
  void window.api.runtimeEnvironments
    .call({
      selector: environmentId,
      method: 'terminal.split',
      params: {
        terminal: remote.handle,
        direction,
        telemetrySource
      },
      timeoutMs: 15_000
    })
    .then((response) => {
      unwrapRuntimeRpcResult(response as RuntimeRpcResponse<{ split: RuntimeTerminalSplit }>)
    })
    .catch((error) => {
      releasePendingMirrorSuppression()
      console.warn(
        '[web-runtime-session] failed to split terminal:',
        error instanceof Error ? error.message : String(error)
      )
    })
  return true
}

export function consumePendingWebRuntimeSplitMirrorTelemetry(
  sourcePtyId: string | null | undefined,
  direction: 'horizontal' | 'vertical'
): boolean {
  if (!sourcePtyId) {
    return false
  }
  const key = getPendingWebRuntimeSplitMirrorTelemetryKey(sourcePtyId, direction)
  const ids = pendingWebRuntimeSplitMirrorTelemetry.get(key)
  const id = ids?.values().next().value
  if (!ids || !id) {
    return false
  }
  ids.delete(id)
  if (ids.size === 0) {
    pendingWebRuntimeSplitMirrorTelemetry.delete(key)
  }
  return true
}

function reservePendingWebRuntimeSplitMirrorTelemetry(
  sourcePtyId: string,
  direction: 'horizontal' | 'vertical'
): string {
  const id = String(++pendingWebRuntimeSplitMirrorTelemetryId)
  const key = getPendingWebRuntimeSplitMirrorTelemetryKey(sourcePtyId, direction)
  const ids = pendingWebRuntimeSplitMirrorTelemetry.get(key) ?? new Set<string>()
  ids.add(id)
  pendingWebRuntimeSplitMirrorTelemetry.set(key, ids)
  return id
}

function schedulePendingWebRuntimeSplitMirrorTelemetryRelease(
  sourcePtyId: string,
  direction: 'horizontal' | 'vertical',
  id: string
): () => void {
  let released = false
  const release = (): void => {
    if (released) {
      return
    }
    released = true
    releasePendingWebRuntimeSplitMirrorTelemetry(sourcePtyId, direction, id)
  }
  const timeout = globalThis.setTimeout(release, WEB_RUNTIME_SPLIT_MIRROR_SUPPRESSION_TTL_MS)
  return () => {
    globalThis.clearTimeout(timeout)
    release()
  }
}

function releasePendingWebRuntimeSplitMirrorTelemetry(
  sourcePtyId: string,
  direction: 'horizontal' | 'vertical',
  id: string
): void {
  const key = getPendingWebRuntimeSplitMirrorTelemetryKey(sourcePtyId, direction)
  const ids = pendingWebRuntimeSplitMirrorTelemetry.get(key)
  if (!ids) {
    return
  }
  ids.delete(id)
  if (ids.size === 0) {
    pendingWebRuntimeSplitMirrorTelemetry.delete(key)
  }
}

function getPendingWebRuntimeSplitMirrorTelemetryKey(
  sourcePtyId: string,
  direction: 'horizontal' | 'vertical'
): string {
  return `${direction}:${sourcePtyId}`
}

export function closeWebRuntimeTerminal(ptyId: string | null | undefined): boolean {
  if (!ptyId) {
    return false
  }
  const remote = parseRemoteRuntimePtyId(ptyId)
  const environmentId = remote?.environmentId?.trim()
  if (!remote || !environmentId || !isWebRuntimeSessionActive(environmentId)) {
    return false
  }

  // Why: host-session mirror panes are detached locally in the browser, but
  // the host owns the real pane graph. Close the host terminal first so later
  // session snapshots cannot resurrect the locally removed pane.
  void window.api.runtimeEnvironments
    .call({
      selector: environmentId,
      method: 'terminal.close',
      params: {
        terminal: remote.handle
      },
      timeoutMs: 15_000
    })
    .then((response) => {
      unwrapRuntimeRpcResult(response as RuntimeRpcResponse<{ close: RuntimeTerminalClose }>)
    })
    .catch((error) => {
      console.warn(
        '[web-runtime-session] failed to close terminal pane:',
        error instanceof Error ? error.message : String(error)
      )
    })
  return true
}

// Why: pane geometry inside a tab (split ratios, expanded pane, pane titles) is
// host-authoritative for remote-server tabs, so a local-only divider drag /
// expand / pane-rename reverts on the next snapshot. Push the structure to the
// host so it persists. tabId is the local web tab id; we resolve the host id.
export async function updateWebRuntimePaneLayout(args: {
  worktreeId: string
  tabId: string
  root: TerminalPaneLayoutNode | null
  expandedLeafId: string | null
  titlesByLeafId?: Record<string, string>
}): Promise<boolean> {
  const environmentId =
    getRuntimeEnvironmentIdForWorktree(useAppStore.getState(), args.worktreeId) ?? null
  if (!environmentId || !isWebRuntimeSessionActive(environmentId)) {
    return false
  }
  const hostTabId = isWebTerminalSurfaceTabId(args.tabId)
    ? toHostSessionTabId(args.tabId)
    : args.tabId
  try {
    const response = await window.api.runtimeEnvironments.call({
      selector: environmentId,
      method: 'session.tabs.updatePaneLayout',
      params: {
        worktree: toRuntimeWorktreeSelector(args.worktreeId),
        tabId: hostTabId,
        root: args.root,
        expandedLeafId: args.expandedLeafId,
        ...(args.titlesByLeafId ? { titlesByLeafId: args.titlesByLeafId } : {})
      },
      timeoutMs: 15_000
    })
    unwrapRuntimeRpcResult(response as RuntimeRpcResponse<{ updated: true }>)
    return true
  } catch (error) {
    console.warn(
      '[web-runtime-session] failed to update pane layout:',
      error instanceof Error ? error.message : String(error)
    )
    return false
  }
}

// Why: tab color/pin are host-authoritative for remote-server tabs; mirror the
// change to the host so it persists and survives the next snapshot. Pass only
// the fields that changed (undefined = leave as-is on the host).
export function setWebRuntimeTabProps(args: {
  worktreeId: string
  tabId: string
  color?: string | null
  isPinned?: boolean
  viewMode?: 'terminal' | 'chat'
}): boolean {
  const environmentId =
    getRuntimeEnvironmentIdForWorktree(useAppStore.getState(), args.worktreeId) ?? null
  if (!environmentId || !isWebRuntimeSessionActive(environmentId)) {
    return false
  }
  const state = useAppStore.getState()
  void import('./web-session-tabs-sync')
    .then(({ resolveHostSessionTabIdForWebSessionTab }) => {
      const hostTabId =
        resolveHostSessionTabIdForWebSessionTab(state, {
          environmentId,
          worktreeId: args.worktreeId,
          tabId: args.tabId
        }) ?? (isWebTerminalSurfaceTabId(args.tabId) ? toHostSessionTabId(args.tabId) : args.tabId)
      return window.api.runtimeEnvironments.call({
        selector: environmentId,
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
    })
    .then((response) => {
      unwrapRuntimeRpcResult(response as RuntimeRpcResponse<{ updated: true }>)
    })
    .catch((error) => {
      console.warn(
        '[web-runtime-session] failed to set tab props:',
        error instanceof Error ? error.message : String(error)
      )
    })
  return true
}

// Why: clearing scrollback locally (pane.terminal.clear()) is undone by the next
// host snapshot/re-subscribe, which replays the host buffer. Clear the host
// buffer too so the clear actually sticks on a remote-server pane.
export function clearWebRuntimeTerminalBuffer(ptyId: string | null | undefined): boolean {
  if (!ptyId) {
    return false
  }
  const remote = parseRemoteRuntimePtyId(ptyId)
  const environmentId = remote?.environmentId?.trim()
  if (!remote || !environmentId || !isWebRuntimeSessionActive(environmentId)) {
    return false
  }
  void window.api.runtimeEnvironments
    .call({
      selector: environmentId,
      method: 'terminal.clearBuffer',
      params: { terminal: remote.handle },
      timeoutMs: 15_000
    })
    .then((response) => {
      unwrapRuntimeRpcResult(response as RuntimeRpcResponse<{ clear: unknown }>)
    })
    .catch((error) => {
      console.warn(
        '[web-runtime-session] failed to clear terminal buffer:',
        error instanceof Error ? error.message : String(error)
      )
    })
  return true
}
