import type { RuntimeMobileSessionTabsResult } from '@yiru/runtime-protocol/workbench/runtime-types'

import type { AppState } from '../../store/state'
import { useAppStore } from '../../store/state'
import { isWebSessionCloseIntentPending, reconcileWebSessionCloseIntents } from './close-intent'
import { clearWebSessionFocusIntent, peekWebSessionFocusIntent } from './focus-intent'
import { buildWebSessionGroupReconciliation } from './group-reconciliation'
import { buildWebSessionResourceReconciliation } from './resource-reconciliation'
import { resolveWebSessionSnapshotSelection } from './selection-reconciliation'
import { buildWebSessionSnapshotPatch } from './snapshot-patch'
import { buildWebSessionSurfaceMirror } from './surface-reconciliation'
import type { WebSessionTabsSyncState } from './tabs-state'
import { shouldApplyWebSessionTabsSnapshot } from './tabs-tracking'

export function applyWebSessionTabsSnapshot(
  state: WebSessionTabsSyncState,
  rawSnapshot: RuntimeMobileSessionTabsResult,
  environmentId: string,
  now = Date.now()
): WebSessionTabsSyncState | Partial<WebSessionTabsSyncState> {
  const worktreeId = rawSnapshot.worktree
  // Why: a remote close prunes the local mirror immediately, but an in-flight
  // pre-close snapshot can still list the tab and flash it back. Drop any tab
  // the client is closing until the host confirms removal; reconcile the intents
  // against the full snapshot first so confirmed (absent) closes clear.
  // Why: must match the id the close path records as the intent. The close RPC
  // resolves to the host session tab id (terminal parentTabId; otherwise tab.id)
  // — keying browser on browserPageId instead never matched, so browser closes
  // were never suppressed and reconcile cleared the intent on the still-present
  // snapshot. The host also addresses tabs by session id, not page id.
  const snapshotHostTabId = (tab: RuntimeMobileSessionTabsResult['tabs'][number]): string =>
    tab.type === 'terminal' ? tab.parentTabId : tab.id
  reconcileWebSessionCloseIntents(
    worktreeId,
    new Set(rawSnapshot.tabs.map((tab) => snapshotHostTabId(tab)))
  )
  const snapshot: RuntimeMobileSessionTabsResult = rawSnapshot.tabs.some((tab) =>
    isWebSessionCloseIntentPending(worktreeId, snapshotHostTabId(tab), now)
  )
    ? {
        ...rawSnapshot,
        tabs: rawSnapshot.tabs.filter(
          (tab) => !isWebSessionCloseIntentPending(worktreeId, snapshotHostTabId(tab), now)
        )
      }
    : rawSnapshot
  // Why: only follow the snapshot's active tab over the user's current focus when
  // the client itself initiated this activation (a create/activate it recorded).
  // An unsolicited server-active (e.g. an agent "thinking" echo) must not steal
  // focus — that's the #5435 contract. Intent matches by the host active tab id
  // (terminal session id, or browserPageId for browser tabs); consume it once.
  const focusIntentHostTabId = peekWebSessionFocusIntent(worktreeId)
  const honorSnapshotActiveFocus =
    focusIntentHostTabId !== null &&
    snapshot.activeTabId !== null &&
    (snapshot.activeTabId === focusIntentHostTabId ||
      snapshot.tabs.some(
        (tab) =>
          tab.id === snapshot.activeTabId &&
          tab.type === 'browser' &&
          tab.browserPageId === focusIntentHostTabId
      ))
  if (honorSnapshotActiveFocus) {
    clearWebSessionFocusIntent(worktreeId)
  }
  const surfaceMirror = buildWebSessionSurfaceMirror({
    state,
    snapshot,
    environmentId,
    now,
    worktreeId
  })
  const selection = resolveWebSessionSnapshotSelection({
    state,
    snapshot,
    environmentId,
    worktreeId,
    honorSnapshotActiveFocus,
    surfaceMirror
  })
  const groupMirror = buildWebSessionGroupReconciliation({
    state,
    snapshot,
    worktreeId,
    now,
    surfaceMirror,
    selection
  })
  const resources = buildWebSessionResourceReconciliation({
    state,
    environmentId,
    surfaceMirror
  })
  return buildWebSessionSnapshotPatch({
    state,
    snapshot,
    worktreeId,
    now,
    honorSnapshotActiveFocus,
    surfaceMirror,
    selection,
    groupMirror,
    resources
  })
}

export function applyWebSessionTabsSnapshots(
  state: WebSessionTabsSyncState,
  snapshots: readonly RuntimeMobileSessionTabsResult[],
  environmentId: string,
  now = Date.now()
): WebSessionTabsSyncState | Partial<WebSessionTabsSyncState> {
  let nextState = state
  let mergedPatch: Partial<WebSessionTabsSyncState> = {}
  for (const snapshot of snapshots) {
    const patch = applyWebSessionTabsSnapshot(nextState, snapshot, environmentId, now)
    if (patch === nextState) {
      continue
    }
    mergedPatch = { ...mergedPatch, ...patch }
    nextState = { ...nextState, ...patch }
  }
  return Object.keys(mergedPatch).length === 0 ? state : mergedPatch
}

export function applyFreshWebSessionTabsSnapshot(
  state: WebSessionTabsSyncState,
  snapshot: RuntimeMobileSessionTabsResult,
  environmentId: string,
  now = Date.now()
): WebSessionTabsSyncState | Partial<WebSessionTabsSyncState> {
  if (!shouldApplyWebSessionTabsSnapshot(snapshot, environmentId)) {
    return state
  }
  return applyWebSessionTabsSnapshot(state, snapshot, environmentId, now)
}

export function applyFreshWebSessionTabsSnapshots(
  state: WebSessionTabsSyncState,
  snapshots: readonly RuntimeMobileSessionTabsResult[],
  environmentId: string,
  now = Date.now()
): WebSessionTabsSyncState | Partial<WebSessionTabsSyncState> {
  const freshSnapshots = snapshots.filter((snapshot) =>
    shouldApplyWebSessionTabsSnapshot(snapshot, environmentId)
  )
  return freshSnapshots.length === 0
    ? state
    : applyWebSessionTabsSnapshots(state, freshSnapshots, environmentId, now)
}

export function applyWebSessionTabsStorePatch(
  buildPatch: (state: AppState) => WebSessionTabsSyncState | Partial<WebSessionTabsSyncState>
): void {
  let mirroredAgentStatusChanged = false
  useAppStore.setState((state) => {
    const patch = buildPatch(state)
    mirroredAgentStatusChanged =
      patch !== state && Object.prototype.hasOwnProperty.call(patch, 'agentStatusByPaneKey')
    return patch
  })
  // Why: paired-web snapshots bypass setAgentStatus, so they must explicitly
  // arm the same stale-boundary timer as local hook events.
  if (mirroredAgentStatusChanged) {
    useAppStore.getState().scheduleAgentStatusFreshness()
  }
}
