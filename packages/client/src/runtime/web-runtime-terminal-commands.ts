import { parseRuntimePtyId } from '@yiru/runtime-protocol/terminal-identity/id'
import type { TerminalPaneSplitSource } from '@yiru/runtime-protocol/workbench/feature-education-telemetry'
import type { TerminalPaneLayoutNode } from '@yiru/runtime-protocol/workbench/types'

import { readProjectCatalogRuntimeState } from '../project-catalog/runtime-state'
import { useAppStore } from '../store/state'
import { getRuntimeEnvironmentIdForWorktree } from '../worktree/runtime-owner'
import { callRuntimeOrpc } from './orpc-client'
import { isWebRuntimeSessionActive } from './web-runtime-session-environment'
import { reserveWebRuntimeSplitMirrorTelemetry } from './web-runtime-split-telemetry'
import { isWebTerminalSurfaceTabId, toHostSessionTabId } from './web-terminal-surface-id'
import { toRuntimeWorktreeSelector } from './worktree-selector'

export function splitWebRuntimeTerminal(
  ptyId: string | null | undefined,
  direction: 'horizontal' | 'vertical',
  telemetrySource: TerminalPaneSplitSource
): boolean {
  if (!ptyId) {
    return false
  }
  const remote = parseRuntimePtyId(ptyId)
  const environmentId = remote?.environmentId?.trim()
  if (!remote || !environmentId || !isWebRuntimeSessionActive(environmentId)) {
    return false
  }
  // Why: paired splits must execute on the host pane; a local split would be
  // mirrored back as a separate tab instead of preserving pane geometry.
  const releaseMirrorSuppression = reserveWebRuntimeSplitMirrorTelemetry(ptyId, direction)
  void callRuntimeOrpc(
    { kind: 'environment', environmentId },
    (client) => client.terminal.split,
    { terminal: remote.handle, direction, telemetrySource },
    { timeoutMs: 15_000 }
  ).catch((error) => {
    releaseMirrorSuppression()
    logWebRuntimeTerminalFailure('split terminal', error)
  })
  return true
}

export function closeWebRuntimeTerminal(ptyId: string | null | undefined): boolean {
  if (!ptyId) {
    return false
  }
  const remote = parseRuntimePtyId(ptyId)
  const environmentId = remote?.environmentId?.trim()
  if (!remote || !environmentId || !isWebRuntimeSessionActive(environmentId)) {
    return false
  }
  // Why: the host owns the pane graph; close it there before a later snapshot
  // can resurrect the locally detached mirror.
  void callRuntimeOrpc(
    { kind: 'environment', environmentId },
    (client) => client.terminal.close,
    { terminal: remote.handle },
    { timeoutMs: 15_000 }
  ).catch((error) => logWebRuntimeTerminalFailure('close terminal pane', error))
  return true
}

export async function updateWebRuntimePaneLayout(args: {
  worktreeId: string
  tabId: string
  root: TerminalPaneLayoutNode | null
  expandedLeafId: string | null
  titlesByLeafId?: Record<string, string>
}): Promise<boolean> {
  const environmentId = getRuntimeEnvironmentIdForWorktree(
    readProjectCatalogRuntimeState(),
    args.worktreeId
  )
  if (!environmentId || !isWebRuntimeSessionActive(environmentId)) {
    return false
  }
  const hostTabId = isWebTerminalSurfaceTabId(args.tabId)
    ? toHostSessionTabId(args.tabId)
    : args.tabId
  try {
    await callRuntimeOrpc(
      { kind: 'environment', environmentId },
      (client) => client.session.tabs.updatePaneLayout,
      {
        worktree: toRuntimeWorktreeSelector(args.worktreeId),
        tabId: hostTabId,
        root: args.root,
        expandedLeafId: args.expandedLeafId,
        ...(args.titlesByLeafId ? { titlesByLeafId: args.titlesByLeafId } : {})
      },
      { timeoutMs: 15_000 }
    )
    return true
  } catch (error) {
    logWebRuntimeTerminalFailure('update pane layout', error)
    return false
  }
}

export function setWebRuntimeTabProps(args: {
  worktreeId: string
  tabId: string
  color?: string | null
  isPinned?: boolean
}): boolean {
  const environmentId = getRuntimeEnvironmentIdForWorktree(
    readProjectCatalogRuntimeState(),
    args.worktreeId
  )
  if (!environmentId || !isWebRuntimeSessionActive(environmentId)) {
    return false
  }
  const state = useAppStore.getState()
  void import('./web-session/tabs-tracking')
    .then(({ resolveHostSessionTabIdForWebSessionTab }) => {
      const hostTabId =
        resolveHostSessionTabIdForWebSessionTab(state, {
          environmentId,
          worktreeId: args.worktreeId,
          tabId: args.tabId
        }) ?? (isWebTerminalSurfaceTabId(args.tabId) ? toHostSessionTabId(args.tabId) : args.tabId)
      return callRuntimeOrpc(
        { kind: 'environment', environmentId },
        (client) => client.session.tabs.setTabProps,
        {
          worktree: toRuntimeWorktreeSelector(args.worktreeId),
          tabId: hostTabId,
          ...(args.color !== undefined ? { color: args.color } : {}),
          ...(args.isPinned !== undefined ? { isPinned: args.isPinned } : {})
        },
        { timeoutMs: 15_000 }
      )
    })
    .catch((error) => logWebRuntimeTerminalFailure('set tab props', error))
  return true
}

export function clearWebRuntimeTerminalBuffer(ptyId: string | null | undefined): boolean {
  if (!ptyId) {
    return false
  }
  const remote = parseRuntimePtyId(ptyId)
  const environmentId = remote?.environmentId?.trim()
  if (!remote || !environmentId || !isWebRuntimeSessionActive(environmentId)) {
    return false
  }
  // Why: local clear is undone when the next host snapshot replays its buffer.
  void callRuntimeOrpc(
    { kind: 'environment', environmentId },
    (client) => client.terminal.clearBuffer,
    { terminal: remote.handle },
    { timeoutMs: 15_000 }
  ).catch((error) => logWebRuntimeTerminalFailure('clear terminal buffer', error))
  return true
}

function logWebRuntimeTerminalFailure(action: string, error: unknown): void {
  console.warn(
    `[web-runtime-session] failed to ${action}:`,
    error instanceof Error ? error.message : String(error)
  )
}
