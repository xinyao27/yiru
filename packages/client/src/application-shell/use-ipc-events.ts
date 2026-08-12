import {
  normalizeAgentStatusPayload,
  type AgentStatusIpcPayload,
  type ParsedAgentStatusPayload
} from '@yiru/workbench-model/agent'
/* oxlint-disable max-lines -- Why: this App-level IPC bridge intentionally keeps the renderer's main-process event contract in one place so shortcut, runtime, updater, and agent-status wiring do not drift across files. */
import { useEffect } from 'react'
import { toast } from 'sonner'
import {
  acquireBrowserAutomationVisibility,
  releaseBrowserAutomationVisibility
} from '~renderer/components/browser-pane/browser-automation-visibility'
import {
  nextEditorFontZoomLevel,
  computeEditorFontSize
} from '~renderer/components/editor/font-zoom'
import { openHttpLink } from '~renderer/components/editor/http-link-routing'
import {
  isManualSimulatorLaunchPending,
  rememberPrelaunchedSimulatorSession
} from '~renderer/components/emulator-pane/simulator-launch-coordination'
import { zoomLevelToPercent, ZOOM_MIN, ZOOM_MAX } from '~renderer/components/settings/constants'
import { applyUIZoom } from '~renderer/components/settings/ui-zoom'
import { getVisibleWorktreeIds } from '~renderer/components/sidebar/visible-worktrees'
import {
  handleSwitchRecentTab,
  handleSwitchTab,
  handleSwitchTabAcrossAllTypes,
  handleSwitchTerminalTab
} from '~renderer/components/tab-bar/ipc-tab-switch'
import { TOGGLE_QUICK_COMMANDS_MENU_EVENT } from '~renderer/components/tab-bar/quick-commands-menu-events'
import { ensureSimulatorTab } from '~renderer/components/tab-group/ensure-simulator-tab'
import { shouldSuppressCodexAutoApprovalStatus } from '~renderer/components/terminal-pane/codex-auto-approval-notification-suppression'
import { collectLeafIdsInOrder } from '~renderer/components/terminal-pane/layout-serialization'
import { showTerminalShortcutCaptureNotification } from '~renderer/components/terminal-workspace/terminal-shortcut-capture-notification'
import { requestBackgroundTerminalWorktreeMount } from '~renderer/components/terminal/background-terminal-worktree-mount'
import { showWorkspaceSidebar } from '~renderer/components/workspace-panel/show-sidebar'
import { translate } from '~renderer/i18n/i18n'
import { TOGGLE_FLOATING_TERMINAL_EVENT } from '~renderer/lib/floating-terminal'
import {
  createFloatingWorkspaceBrowserTab,
  createFloatingWorkspaceMarkdownTab,
  createFloatingWorkspaceTerminalTab,
  isEmptyFloatingWorkspacePanelVisible,
  isFloatingWorkspacePanelFocused,
  switchFloatingWorkspaceTab
} from '~renderer/lib/floating-workspace-terminal-actions'
import { focusTerminalTabSurface } from '~renderer/lib/focus-terminal-tab-surface'
import { requestFriday } from '~renderer/lib/friday'
import { openMobileEmulatorTab } from '~renderer/lib/open-mobile-emulator-tab'
import {
  hydrateBrowserDrivers,
  setDriverForBrowserPage
} from '~renderer/lib/pane-manager/browser-mobile-driver-state'
import { setDriverForPty, hydrateDrivers } from '~renderer/lib/pane-manager/mobile-driver-state'
import { setFitOverride, hydrateOverrides } from '~renderer/lib/pane-manager/mobile-fit-overrides'
import { track } from '~renderer/lib/telemetry'
import { activateAndRevealWorktree } from '~renderer/lib/worktree-activation'
import { getRuntimeEnvironmentIdForWorktree } from '~renderer/lib/worktree-runtime-owner'
import { dispatchZoomLevelChanged } from '~renderer/lib/zoom-events'
import {
  getAgentStatusSnapshot,
  getMigrationUnsupportedAgentStatusSnapshot
} from '~renderer/runtime/agent-status-client'
import { subscribeAgentStatusEvents } from '~renderer/runtime/agent-status-events-client'
import { browserShellEventsClient } from '~renderer/runtime/browser-shell-events-client'
import { subscribeRuntimeClientEvents } from '~renderer/runtime/client-events'
import { subscribeEmulatorEvents } from '~renderer/runtime/emulator-events-client'
import { subscribeGitHubPrRefreshEvents } from '~renderer/runtime/github-events-client'
import { subscribeRateLimitUpdates } from '~renderer/runtime/rate-limit-events-client'
import { fetchRateLimitSnapshot } from '~renderer/runtime/rate-limits-client'
import { subscribeRuntimeDriverEvents } from '~renderer/runtime/runtime-driver-events-client'
import { shellClient } from '~renderer/runtime/shell-client'
import { subscribeShellEvent } from '~renderer/runtime/shell-events-client'
import { focusRuntimeTerminalSurface } from '~renderer/runtime/sync-runtime-graph'
import { subscribeRuntimeUIChanges } from '~renderer/runtime/ui-client'
import { setRuntimeUIState } from '~renderer/runtime/ui-client'
import {
  closeWebRuntimeSessionTab,
  createWebRuntimeSessionBrowserTab,
  createWebRuntimeSessionTerminal,
  isWebRuntimeSessionActive
} from '~renderer/runtime/web-runtime-session'
import { workspaceHostClient } from '~renderer/runtime/workspace-host-client'
import { subscribeToWorkspaceSpaceScanProgress } from '~renderer/runtime/workspace-space-client'
import { getWorktreeMapFromState, getRepoMapFromState } from '~renderer/store/selectors'
import { resolveAgentPaneAuthorityKey } from '~renderer/store/slices/agent-pane-authority'
import { titleHasAgentName } from '~shared/agent/detection'
import {
  resolveAgentStatusIdentity,
  shouldSuppressInheritedTerminalStatus
} from '~shared/agent/status-identity'
import { FRIDAY_WORKTREE_ID } from '~shared/constants'
import type { RuntimeClientEvent } from '~shared/runtime-client-events'
import type { RuntimeBrowserDriverState, RuntimeTerminalDriverState } from '~shared/runtime-types'
import { parsePaneKey } from '~shared/stable-pane-id'
import type { UpdateStatus } from '~shared/types'
import { isWslHookRelayConnectionId } from '~shared/wsl-hook-relay-contract'

import { runWorktreeDelete } from '../components/sidebar/delete-worktree/flow'
import { resolveAgentStatusTerminalTitle } from '../components/terminal-pane/agent/status-terminal-title'
import { useAppStore } from '../store'
import { guardPinnedTabClose, resolvePinnedTabLabel } from '../store/pinned-tab-close-guard'
import type { AppState } from '../store/types'
import {
  observeAgentHookCompletionForNotification,
  resetAgentHookCompletionNotificationCoordinators,
  syncAgentHookCompletionNotificationsForStoreUpdate
} from './agent-hook-completion-notifications'
import {
  hasRuntimeBackedAgentStatusAttribution,
  retryPendingAgentStatusEvents,
  type PendingAgentStatusEvent
} from './pending-agent-status-retry'
import { resolveZoomTarget } from './resolve-zoom-target'
import { createRuntimeClientEventsSync } from './runtime-client-events-sync'
import { createRuntimeProjectRefreshScheduler } from './runtime-project-refresh-scheduler'
import { activateTabNumberShortcut } from './tab-number-shortcuts'
import { createWorktreeChangeRefreshQueue } from './worktree-change-refresh-queue'
import { applyWorktreeHeadIdentities } from './worktree-head-identity-apply'

function getShortcutPlatform(): NodeJS.Platform {
  if (navigator.userAgent.includes('Mac')) {
    return 'darwin'
  }
  if (navigator.userAgent.includes('Windows')) {
    return 'win32'
  }
  return 'linux'
}

const BROWSER_AUTOMATION_BOOTSTRAP_LEASE_MS = 10_000
const RUNTIME_PROJECT_REFRESH_CONCURRENCY = 5
const browserAutomationBootstrapLeaseByPageId = new Map<string, { token: string; timer: number }>()

function isPinnedSessionTab(store: AppState, worktreeId: string, visibleId: string): boolean {
  return (store.unifiedTabsByWorktree?.[worktreeId] ?? []).some(
    (tab) => (tab.id === visibleId || tab.entityId === visibleId) && tab.isPinned
  )
}

function releaseBrowserAutomationBootstrapLease(browserPageId: string): void {
  const existing = browserAutomationBootstrapLeaseByPageId.get(browserPageId)
  if (!existing) {
    return
  }
  window.clearTimeout(existing.timer)
  releaseBrowserAutomationVisibility(existing.token)
  browserAutomationBootstrapLeaseByPageId.delete(browserPageId)
}

function findBrowserPageWorktreeId(store: AppState, browserPageId: string): string | null {
  for (const [worktreeId, browserTabs] of Object.entries(store.browserTabsByWorktree)) {
    for (const workspace of browserTabs) {
      if (
        workspace.id === browserPageId ||
        workspace.activePageId === browserPageId ||
        workspace.pageIds?.includes(browserPageId)
      ) {
        return worktreeId
      }
    }
  }

  for (const pages of Object.values(store.browserPagesByWorkspace)) {
    const page = pages.find((candidate) => candidate.id === browserPageId)
    if (page) {
      return page.worktreeId
    }
  }

  return null
}

// Why: exported for browser-tab-shell-requests.ts (Phase 5 slice S6 / 切片
// 47) — the reverse-contract handler for browser tab create needs the same
// bootstrap lease acquisition `onActivateView` uses below, without
// duplicating its dependency on `findBrowserPageWorktreeId`/the visibility
// token bookkeeping.
export function acquireBrowserAutomationBootstrapLease(
  worktreeId: string | null | undefined,
  browserPageId?: string | null
): void {
  const store = useAppStore.getState()
  const targetWorktreeId =
    worktreeId ??
    (browserPageId ? findBrowserPageWorktreeId(store, browserPageId) : null) ??
    store.activeWorktreeId
  if (!targetWorktreeId) {
    return
  }
  requestBackgroundTerminalWorktreeMount({ worktreeId: targetWorktreeId })
  let targetBrowserPageId = browserPageId ?? null
  if (!targetBrowserPageId) {
    const browserTabs = store.browserTabsByWorktree[targetWorktreeId] ?? []
    const activeWorkspaceId = store.activeBrowserTabIdByWorktree[targetWorktreeId] ?? null
    const workspace =
      browserTabs.find((tab) => tab.id === activeWorkspaceId) ?? browserTabs[0] ?? null
    targetBrowserPageId =
      workspace?.activePageId ?? workspace?.pageIds?.[0] ?? workspace?.id ?? null
  }
  if (!targetBrowserPageId) {
    return
  }

  releaseBrowserAutomationBootstrapLease(targetBrowserPageId)
  const token = acquireBrowserAutomationVisibility(targetBrowserPageId)
  const timer = window.setTimeout(() => {
    releaseBrowserAutomationBootstrapLease(targetBrowserPageId)
  }, BROWSER_AUTOMATION_BOOTSTRAP_LEASE_MS)
  browserAutomationBootstrapLeaseByPageId.set(targetBrowserPageId, { token, timer })
}

export { resolveZoomTarget } from './resolve-zoom-target'

const ZOOM_STEP = 0.5
const PENDING_AGENT_STATUS_RETRY_MS = 100
const PENDING_AGENT_STATUS_TTL_MS = 15_000
const MAX_PENDING_AGENT_STATUS_EVENTS = 100
// Why: mobile driver hydration is async; cap transient replay so a stuck IPC
// snapshot cannot retain an unbounded startup buffer.
const MAX_PENDING_MOBILE_STATE_EVENTS = 300
// Why: a folder rename emits a burst of `worktrees:changed` events while the
// worktree list lags the on-disk move, so the deletion diff can transiently see
// the old OR new id as "removed" and tear down the live worktree's PTYs. Protect
// both ids of a recent rename from that diff for a short grace window — genuine
// out-of-band deletions still purge once it lapses. Keyed worktreeId -> expiry ms.
const WORKTREE_RENAME_PURGE_GRACE_MS = 20_000
const recentlyRenamedWorktreeIdExpiry = new Map<string, number>()

function isAgentStatusForRecentlyClosedTab(
  store: Pick<AppState, 'recentlyClosedAgentStatusTabIds' | 'recentlyRetiredAgentStatusPaneKeys'>,
  paneKey: string
): boolean {
  const ownerPaneKey = resolveAgentPaneAuthorityKey(paneKey)
  if (store.recentlyRetiredAgentStatusPaneKeys?.[ownerPaneKey] === true) {
    return true
  }
  const tabId = parsePaneKey(ownerPaneKey)?.tabId
  if (!tabId) {
    return false
  }
  return store.recentlyClosedAgentStatusTabIds[tabId] === true
}

function getAuthoritativeDetectedWorktreeIds(state: AppState, repoId: string): Set<string> | null {
  const detected = state.detectedWorktreesByRepo[repoId]
  if (detected?.authoritative !== true) {
    return null
  }
  return new Set(detected.worktrees.map((worktree) => worktree.id))
}

function getVisibleWorktreeIdsForRepo(state: AppState, repoId: string): Set<string> {
  return new Set((state.worktreesByRepo[repoId] ?? []).map((worktree) => worktree.id))
}

// Why: exported for terminal-create-shell-request.ts and
// terminal-reveal-shell-request.ts (Phase 5 slice S4b, terminal creation
// cluster) — the reverse-contract terminal create/reveal handlers need the
// same worktree-activation and focus helpers the removed inline
// `onCreateTerminal`/`onRequestTerminalCreate` listeners used, without
// duplicating their dependency on the runtime-terminal-surface focus path.
export function focusTerminalInitiatedTab(tabId: string, leafId?: string | null): void {
  if (!focusRuntimeTerminalSurface(tabId, leafId)) {
    focusTerminalTabSurface(tabId, leafId)
  }
}

export function activateTerminalInitiatedWorktree(store: AppState, worktreeId: string): void {
  store.setActiveView('terminal')
  store.setActiveWorktree(worktreeId)
  // Why: CLI/runtime terminal focus is user-visible worktree navigation, so it
  // must feed both Cmd+J recency and the titlebar back/forward stack.
  store.markWorktreeVisited(worktreeId)
  if (!store.isNavigatingHistory) {
    store.recordWorktreeVisit(worktreeId)
  }
}

type BrowserSessionTabTarget =
  | { kind: 'unified-browser'; unifiedTabId: string; workspaceId: string; groupId: string }
  | { kind: 'fallback-browser'; workspaceId: string }

type NewWorkspaceShortcutModalData = { telemetrySource: 'shortcut' }

export function buildNewWorkspaceShortcutModalData(): NewWorkspaceShortcutModalData {
  return { telemetrySource: 'shortcut' }
}

export function openNewWorkspaceFromShortcut(
  state: Pick<AppState, 'activeModal' | 'openModal'>
): void {
  if (state.activeModal === 'new-workspace-composer') {
    return
  }
  state.openModal('new-workspace-composer', buildNewWorkspaceShortcutModalData())
}

export function resolveBrowserSessionTabTarget(
  state: Pick<AppState, 'browserTabsByWorktree' | 'unifiedTabsByWorktree'>,
  worktreeId: string,
  tabId: string
): BrowserSessionTabTarget | null {
  const tab = (state.unifiedTabsByWorktree[worktreeId] ?? []).find((item) => item.id === tabId)
  if (tab?.contentType === 'browser') {
    return {
      kind: 'unified-browser',
      unifiedTabId: tab.id,
      workspaceId: tab.entityId,
      groupId: tab.groupId
    }
  }
  const fallbackBrowser = (state.browserTabsByWorktree[worktreeId] ?? []).find(
    (workspace) => workspace.id === tabId
  )
  return fallbackBrowser ? { kind: 'fallback-browser', workspaceId: fallbackBrowser.id } : null
}

// Why: exported for browser-tab-shell-requests.ts (Phase 5 slice S6 / 切片
// 47) — the reverse-contract browser tab handlers need the same
// remote-runtime-active guard the inline `onRequestTabX` handlers used to
// check before this migration.
export function isRuntimeEnvironmentActive(): boolean {
  return Boolean(useAppStore.getState().settings?.activeRuntimeEnvironmentId?.trim())
}

function getActiveRuntimeEnvironmentId(): string | null {
  return useAppStore.getState().settings?.activeRuntimeEnvironmentId?.trim() || null
}

function getRuntimeClientEventEnvironmentIds(): string[] {
  const state = useAppStore.getState()
  const ids = new Set<string>()
  const activeEnvironmentId = getActiveRuntimeEnvironmentId()
  if (activeEnvironmentId) {
    ids.add(activeEnvironmentId)
  }
  for (const environment of state.runtimeEnvironments ?? []) {
    const status = state.runtimeStatusByEnvironmentId?.get(environment.id)
    if (status?.status) {
      ids.add(environment.id)
    }
  }
  return [...ids]
}

function getReachableRuntimeEnvironmentIds(): string[] {
  const state = useAppStore.getState()
  const ids: string[] = []
  for (const [environmentId, status] of state.runtimeStatusByEnvironmentId ?? []) {
    if (status?.status) {
      ids.push(environmentId)
    }
  }
  return ids
}

function buildRuntimeClientEventEnvironmentKey(environmentIds: string[]): string {
  return [...new Set(environmentIds)].sort().join('\u0000')
}

/** Ids in `next` not in `previous` — runtime environments that just became connected. */
function getNewlyConnectedRuntimeEnvironmentIds(
  previous: readonly string[],
  next: readonly string[]
): string[] {
  const known = new Set(previous)
  return [...new Set(next)].filter((environmentId) => !known.has(environmentId))
}

export function getRuntimeProjectRefreshEnvironmentIds(args: {
  previousDesired: readonly string[]
  nextDesired: readonly string[]
  previousReachable: readonly string[]
  nextReachable: readonly string[]
}): string[] {
  return [
    ...new Set([
      ...getNewlyConnectedRuntimeEnvironmentIds(args.previousDesired, args.nextDesired),
      ...getNewlyConnectedRuntimeEnvironmentIds(args.previousReachable, args.nextReachable)
    ])
  ]
}

async function refreshRuntimeProjectWorktrees(repos: readonly { id: string }[]): Promise<void> {
  let nextIndex = 0
  const failures: { repoId: string; error: unknown }[] = []
  const workerCount = Math.min(RUNTIME_PROJECT_REFRESH_CONCURRENCY, repos.length)

  // Why: one coalesced remote repo event can still represent many repos; keep the
  // expensive worktree probes bounded so idle refresh never floods the renderer.
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < repos.length) {
        const index = nextIndex
        nextIndex += 1
        const repoId = repos[index].id
        try {
          await useAppStore.getState().fetchWorktrees(repoId)
        } catch (error) {
          failures.push({ repoId, error })
        }
      }
    })
  )
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((failure) => failure.error),
      `Failed to refresh ${failures.length} runtime project worktree(s): ${failures
        .map((failure) => failure.repoId)
        .join(', ')}`
    )
  }
}

function getWorktreeRuntimeEnvironmentId(worktreeId: string | null | undefined): string | null {
  return getRuntimeEnvironmentIdForWorktree(useAppStore.getState(), worktreeId)
}

export function useIpcEvents(): void {
  useEffect(() => {
    const unsubs: (() => void)[] = []
    type AgentStatusApplyResult = 'applied' | 'pending' | 'dropped'
    const pendingAgentStatusEvents: PendingAgentStatusEvent<AgentStatusIpcPayload>[] = []
    let pendingAgentStatusRetryTimer: ReturnType<typeof setTimeout> | null = null
    // Why: applyAgentStatus -> store.setAgentStatus notifies the store
    // subscriber synchronously, which re-enters flushPendingAgentStatuses while
    // the queue is still mid-drain. Guard against that re-entrancy so the same
    // event is not reprocessed forever (crash 9fc89529: stack overflow).
    let isFlushingAgentStatuses = false

    const handleWorktreesChanged = async (
      repoId: string,
      renamed?: { oldWorktreeId: string; newWorktreeId: string }
    ): Promise<void> => {
      // Why: a folder rename changes the worktree's path-derived id. Re-key every
      // worktree-scoped map to the new id BEFORE the deletion diff below so the
      // rename is not mistaken for a deletion that would tear down the live
      // worktree. Capture active-ness before migrating (which moves the pointer).
      const renamedWasActive =
        renamed != null && useAppStore.getState().activeWorktreeId === renamed.oldWorktreeId
      if (renamed) {
        // Shield both ids from the deletion diff across the rename's event burst
        // (any event, any order) — the worktree list lags the on-disk move.
        const expiry = Date.now() + WORKTREE_RENAME_PURGE_GRACE_MS
        recentlyRenamedWorktreeIdExpiry.set(renamed.oldWorktreeId, expiry)
        recentlyRenamedWorktreeIdExpiry.set(renamed.newWorktreeId, expiry)
        useAppStore.getState().migrateWorktreeIdentity(renamed.oldWorktreeId, renamed.newWorktreeId)
      }
      // Why: diff before vs. after fetchWorktrees to detect server-side
      // deletions (CLI `yiru worktree rm`, other window, out-of-band RPC)
      // and purge worktree-scoped state for removed ids. Without this,
      // `ptyIdsByTabId` would retain entries for tabs whose worktree is
      // gone, and SessionsStatusSegment's `boundPtyIds` set would keep
      // misclassifying the zombie as bound (design §2c, §4.4).
      const state = useAppStore.getState()
      const before =
        getAuthoritativeDetectedWorktreeIds(state, repoId) ??
        getVisibleWorktreeIdsForRepo(state, repoId)
      await state.fetchWorktrees(repoId)
      await useAppStore.getState().fetchWorktreeLineage()
      // Why: changing the worktree's id unmounts the active pane without
      // re-rendering it under the new id. Now that the list has refreshed,
      // re-activate the renamed worktree so its tab model reconciles and the
      // pane reconnects — otherwise the tab vanishes until manual re-selection.
      if (renamedWasActive && renamed) {
        useAppStore.getState().setActiveWorktree(renamed.newWorktreeId)
      }
      const afterState = useAppStore.getState()
      const after = getAuthoritativeDetectedWorktreeIds(afterState, repoId)
      if (!after) {
        return
      }
      const now = Date.now()
      const removed: string[] = []
      for (const id of before) {
        if (after.has(id)) {
          continue
        }
        // A recently renamed worktree's old/new id is not a deletion — its
        // state moved (or is moving) to the new id; the list just lags.
        const graceExpiry = recentlyRenamedWorktreeIdExpiry.get(id)
        if (graceExpiry != null && graceExpiry > now) {
          continue
        }
        removed.push(id)
      }
      for (const [id, expiry] of recentlyRenamedWorktreeIdExpiry) {
        if (expiry <= now) {
          recentlyRenamedWorktreeIdExpiry.delete(id)
        }
      }
      if (removed.length > 0) {
        console.warn(
          `[worktree-purge] diff-based purge removing state for ${removed.length} worktree(s):`,
          removed
        )
        afterState.purgeWorktreeTerminalState(removed)
        afterState.removeWorkspaceSpaceWorktrees(removed)
      }
    }
    const worktreeChangeRefreshQueue = createWorktreeChangeRefreshQueue(handleWorktreesChanged)
    unsubs.push(worktreeChangeRefreshQueue.dispose)

    const activateNotifiedWorktree = async (
      {
        repoId,
        worktreeId,
        setup,
        startup,
        defaultTabs
      }: Extract<RuntimeClientEvent, { type: 'activateWorktree' }>,
      options: { allowRuntimeEnvironment: boolean }
    ): Promise<void> => {
      if (!options.allowRuntimeEnvironment && isRuntimeEnvironmentActive()) {
        // Why: local CLI-created worktree events carry local repo/worktree
        // ids. Runtime host activation arrives through the remote event
        // stream and is allowed through this helper separately.
        return
      }
      const existedBeforeFetch = Boolean(useAppStore.getState().getKnownWorktreeById(worktreeId))
      // Why: fetch worktrees first so the activation helper can resolve
      // the CLI-created worktree via findWorktreeById — it arrived from
      // the main process and is not yet in the renderer state.
      await useAppStore.getState().fetchWorktrees(repoId)
      const existsAfterFetch = Boolean(useAppStore.getState().getKnownWorktreeById(worktreeId))
      // Why: route through activateAndRevealWorktree so CLI-created
      // worktrees share the canonical activation path with UI-created
      // ones. This records the visit in the back/forward history stack
      // (recordWorktreeVisit), without which the nav buttons would
      // ignore the CLI-driven workspace switch.
      activateAndRevealWorktree(worktreeId, {
        ...(setup ? { setup } : {}),
        ...(startup ? { startup } : {}),
        ...(defaultTabs ? { defaultTabs } : {}),
        ...(!existedBeforeFetch && existsAfterFetch ? { sidebarRevealBehavior: 'auto' } : {}),
        // Why: this activation already came from the host runtime event stream.
        // Echoing it back as worktree.activate can create a selection loop.
        notifyHostRuntime: false
      })
    }

    const ensureRuntimeEventRepoKnown = async (
      environmentId: string,
      repoId: string
    ): Promise<void> => {
      if ((useAppStore.getState().repos ?? []).some((repo) => repo.id === repoId)) {
        return
      }
      await useAppStore.getState().fetchRuntimeEnvironmentRepos(environmentId)
    }

    const runtimeProjectRefreshScheduler = createRuntimeProjectRefreshScheduler({
      refresh: async (environmentId) => {
        const repos = await useAppStore.getState().fetchRuntimeEnvironmentRepos(environmentId)
        await refreshRuntimeProjectWorktrees(repos)
        await useAppStore.getState().fetchWorktreeLineage()
      },
      onError: (error) => {
        console.error('Failed to refresh runtime projects:', error)
      }
    })

    const handleRuntimeClientEvent = (environmentId: string, event: RuntimeClientEvent): void => {
      if (event.type === 'reposChanged') {
        runtimeProjectRefreshScheduler.request(environmentId)
        return
      }
      if (event.type === 'worktreesChanged') {
        void ensureRuntimeEventRepoKnown(environmentId, event.repoId).then(() =>
          worktreeChangeRefreshQueue.enqueue({
            repoId: event.repoId,
            ...(event.renamed ? { renamed: event.renamed } : {})
          })
        )
        return
      }
      if (event.type === 'worktreeHeadIdentitiesChanged') {
        // Why: same signal workspaceHostClient.worktrees.onHeadIdentitiesChanged applies
        // for the local runtime; a remote environment's host arrives here
        // instead, since only local worktree events are gated by
        // isRuntimeEnvironmentActive() in the preload push below.
        const state = useAppStore.getState()
        applyWorktreeHeadIdentities(event, {
          getWorktreesForRepo: (repoId) => state.worktreesByRepo[repoId],
          updateWorktreeGitIdentity: state.updateWorktreeGitIdentity
        })
        return
      }
      void ensureRuntimeEventRepoKnown(environmentId, event.repoId)
        .then(() => activateNotifiedWorktree(event, { allowRuntimeEnvironment: true }))
        .catch((error) => {
          console.error('Failed to activate runtime-created worktree:', error)
        })
    }

    const runtimeClientEventsSync = createRuntimeClientEventsSync({
      getDesiredEnvironmentIds: getRuntimeClientEventEnvironmentIds,
      subscribe: (environmentId, onEvent, onError) =>
        subscribeRuntimeClientEvents(environmentId, onEvent, onError, () => {
          // Why: worktreesChanged/reposChanged during the transport gap are
          // lost, not queued. A quick drop can replay without ever flipping the
          // env unreachable, so the reachability-transition refetch never runs
          // and a server-created worktree stays invisible until relaunch
          // (#7970). The scheduler debounces, so this stays cheap.
          runtimeProjectRefreshScheduler.request(environmentId)
        }),
      onEvent: handleRuntimeClientEvent
    })

    runtimeClientEventsSync.sync()
    // Why: PR #2 removed desktop's eager session-sync discovery and there is no
    // on-connect repo fetch, so remote projects only appeared after the user
    // opened the Add-Project dropdown. Seed discovery for runtimes already
    // connected at mount, and for each newly-connected one below. The scheduler
    // debounces/throttles, so this stays cheap even with chatty status updates.
    let runtimeClientEventEnvironmentIds = getRuntimeClientEventEnvironmentIds()
    for (const environmentId of runtimeClientEventEnvironmentIds) {
      runtimeProjectRefreshScheduler.request(environmentId)
    }
    let runtimeClientEventEnvironmentKey = buildRuntimeClientEventEnvironmentKey(
      runtimeClientEventEnvironmentIds
    )
    let reachableRuntimeEnvironmentIds = getReachableRuntimeEnvironmentIds()
    let reachableRuntimeEnvironmentKey = buildRuntimeClientEventEnvironmentKey(
      reachableRuntimeEnvironmentIds
    )
    unsubs.push(
      useAppStore.subscribe(() => {
        const nextEnvironmentIds = getRuntimeClientEventEnvironmentIds()
        const nextKey = buildRuntimeClientEventEnvironmentKey(nextEnvironmentIds)
        const nextReachableEnvironmentIds = getReachableRuntimeEnvironmentIds()
        const nextReachableKey = buildRuntimeClientEventEnvironmentKey(nextReachableEnvironmentIds)
        if (
          nextKey === runtimeClientEventEnvironmentKey &&
          nextReachableKey === reachableRuntimeEnvironmentKey
        ) {
          return
        }
        for (const environmentId of getRuntimeProjectRefreshEnvironmentIds({
          previousDesired: runtimeClientEventEnvironmentIds,
          nextDesired: nextEnvironmentIds,
          previousReachable: reachableRuntimeEnvironmentIds,
          nextReachable: nextReachableEnvironmentIds
        })) {
          runtimeProjectRefreshScheduler.request(environmentId)
        }
        runtimeClientEventEnvironmentIds = nextEnvironmentIds
        runtimeClientEventEnvironmentKey = nextKey
        reachableRuntimeEnvironmentIds = nextReachableEnvironmentIds
        reachableRuntimeEnvironmentKey = nextReachableKey
        runtimeClientEventsSync.sync()
      })
    )
    unsubs.push(runtimeClientEventsSync.stop)
    unsubs.push(runtimeProjectRefreshScheduler.stop)

    unsubs.push(
      workspaceHostClient.repos.onChanged(() => {
        const state = useAppStore.getState()
        if (isRuntimeEnvironmentActive()) {
          // Why: the all-host sidebar includes local repos even when a runtime
          // is focused, so local store changes must refresh the local slice
          // without dropping the runtime-owned slices already shown.
          void (async () => {
            await state.fetchReposForAllHosts()
            await state.fetchProjectGroupsForAllHosts()
            await state.fetchFolderWorkspacesForAllHosts()
          })()
          return
        }
        void state.fetchProjectGroups()
        void state.fetchFolderWorkspaces()
        void state.fetchRepos()
      })
    )

    unsubs.push(
      workspaceHostClient.worktrees.onChanged(
        async (data: {
          repoId: string
          renamed?: { oldWorktreeId: string; newWorktreeId: string }
        }) => {
          if (isRuntimeEnvironmentActive()) {
            // Why: local worktree events carry local repo ids. Fetching the
            // active runtime with those ids can purge or overwrite server state.
            return
          }
          // A folder rename changes the worktree id; handleWorktreesChanged
          // re-keys state and shields it from the deletion diff (see there).
          worktreeChangeRefreshQueue.enqueue(data)
        }
      )
    )

    if (workspaceHostClient.worktrees.onHeadIdentitiesChanged) {
      unsubs.push(
        workspaceHostClient.worktrees.onHeadIdentitiesChanged((data) => {
          if (isRuntimeEnvironmentActive()) {
            // Why: local worktree events carry local repo ids (see onChanged).
            return
          }
          const state = useAppStore.getState()
          applyWorktreeHeadIdentities(data, {
            getWorktreesForRepo: (repoId) => state.worktreesByRepo[repoId],
            updateWorktreeGitIdentity: state.updateWorktreeGitIdentity
          })
        })
      )
    }

    unsubs.push(
      workspaceHostClient.worktrees.onBaseStatus((event) => {
        if (isRuntimeEnvironmentActive()) {
          return
        }
        useAppStore.getState().updateWorktreeBaseStatus(event)
      })
    )

    unsubs.push(
      workspaceHostClient.worktrees.onRemoteBranchConflict((event) => {
        if (isRuntimeEnvironmentActive()) {
          return
        }
        useAppStore.getState().updateWorktreeRemoteBranchConflict(event)
      })
    )

    // Why: drive each background creation's status panel by routing the main
    // process's two-phase progress to its pending entry via the correlation id.
    // Guarded with `?.` so a stale preload bundle doesn't crash the listener set.
    unsubs.push(
      workspaceHostClient.worktrees.onCreateProgress?.((data) => {
        if (!data.creationId) {
          return
        }
        useAppStore.getState().updatePendingWorktreeCreation(data.creationId, { phase: data.phase })
      }) ?? (() => {})
    )

    unsubs.push(
      subscribeGitHubPrRefreshEvents((event) => {
        useAppStore.getState().applyGitHubPRRefreshEvent(event)
      })
    )

    unsubs.push(
      shellClient.ui.onOpenSettings(() => {
        useAppStore.getState().openSettingsPage()
      })
    )

    unsubs.push(
      shellClient.ui.onOpenSetupGuide?.(() => {
        useAppStore.getState().openModal('setup-guide', { telemetrySource: 'help_menu' })
      }) ?? (() => {})
    )

    unsubs.push(
      shellClient.ui.onOpenFeatureTour(() => {
        useAppStore.getState().openModal('feature-wall', { source: 'help_menu' })
      })
    )

    // Why: settings events are invalidations rather than a second settings
    // schema. Re-read the shell-owned full document so menu-originated fields
    // that are intentionally absent from RuntimeClientSettings stay intact.
    unsubs.push(
      subscribeShellEvent((event) => {
        if (event.type === 'settingsChanged') {
          void useAppStore.getState().fetchSettings()
        }
      })
    )

    // Why: UI view-state is shared across clients through the runtime contract.
    // Subscribe to that one event source so Electron and web observe the same updates.
    unsubs.push(
      subscribeRuntimeUIChanges((ui) => {
        useAppStore.getState().hydratePersistedUI(ui, 'sync')
      })
    )

    if (shellClient.keybindings) {
      unsubs.push(
        shellClient.keybindings.onChanged((snapshot) => {
          useAppStore.getState().setKeybindingSnapshot(snapshot)
        })
      )
    }

    unsubs.push(
      shellClient.ui.onToggleLeftSidebar(() => {
        useAppStore.getState().toggleSidebar()
      })
    )

    unsubs.push(
      shellClient.ui.onToggleRightSidebar(() => {
        const store = useAppStore.getState()
        if (store.activeView !== 'terminal') {
          return
        }
        if (store.activeCoworkingWorkspaceRoute) {
          store.showRightSidebarFiles()
          return
        }
        if (!store.activeWorktreeId) {
          return
        }
        showWorkspaceSidebar({ view: 'explorer' })
      })
    )

    unsubs.push(
      shellClient.ui.onToggleWorktreePalette(() => {
        const store = useAppStore.getState()
        if (store.activeModal === 'worktree-palette') {
          store.closeModal()
          return
        }
        store.openModal('worktree-palette')
      })
    )

    unsubs.push(
      shellClient.ui.onToggleFloatingTerminal(() => {
        window.dispatchEvent(new CustomEvent(TOGGLE_FLOATING_TERMINAL_EVENT))
      })
    )

    unsubs.push(
      shellClient.ui.onToggleAssistant(() => {
        requestFriday()
      })
    )

    if (shellClient.ui.onTerminalShortcutCaptured) {
      unsubs.push(
        shellClient.ui.onTerminalShortcutCaptured(({ actionId }) => {
          showTerminalShortcutCaptureNotification({
            actionId,
            platform: getShortcutPlatform(),
            keybindings: useAppStore.getState().keybindings
          })
        })
      )
    }

    unsubs.push(
      shellClient.ui.onOpenQuickOpen(() => {
        const store = useAppStore.getState()
        if (store.activeView === 'terminal' && store.activeWorktreeId !== null) {
          store.openModal('quick-open')
        }
      })
    )

    unsubs.push(
      shellClient.ui.onToggleQuickCommandsMenu(() => {
        window.dispatchEvent(new CustomEvent(TOGGLE_QUICK_COMMANDS_MENU_EVENT))
      })
    )

    unsubs.push(
      shellClient.ui.onOpenNewWorkspace(() => {
        const store = useAppStore.getState()
        openNewWorkspaceFromShortcut(store)
      })
    )

    if (shellClient.ui.onDeleteCurrentWorkspace) {
      unsubs.push(
        shellClient.ui.onDeleteCurrentWorkspace(() => {
          const store = useAppStore.getState()
          if (
            store.activeModal !== 'none' ||
            store.activeView !== 'terminal' ||
            !store.activeWorktreeId
          ) {
            return
          }
          runWorktreeDelete(store.activeWorktreeId)
        })
      )
    }

    unsubs.push(
      shellClient.ui.onJumpToWorktreeIndex((index) => {
        const store = useAppStore.getState()
        if (store.activeView !== 'terminal') {
          return
        }
        const visibleIds = getVisibleWorktreeIds()
        if (index < visibleIds.length) {
          activateAndRevealWorktree(visibleIds[index])
        }
      })
    )

    unsubs.push(
      shellClient.ui.onJumpToTabIndex((index) => {
        activateTabNumberShortcut(index)
      })
    )

    unsubs.push(
      shellClient.ui.onWorktreeHistoryNavigate((direction) => {
        const store = useAppStore.getState()
        // Why: mirror the button-visibility rule — worktree history navigation
        // is only meaningful in the terminal (worktree) view. Settings
        // transitions aren't worktree activations and the buttons are hidden,
        // so the shortcut no-ops there too.
        if (store.activeView !== 'terminal') {
          return
        }
        if (direction === 'back') {
          store.goBackWorktree()
        } else {
          store.goForwardWorktree()
        }
      })
    )

    unsubs.push(
      shellClient.ui.onToggleStatusBar(() => {
        const store = useAppStore.getState()
        store.setStatusBarVisible(!store.statusBarVisible)
      })
    )

    // Hydrate initial update status then subscribe to changes
    shellClient.updater.getStatus().then((status) => {
      useAppStore.getState().setUpdateStatus(status as UpdateStatus)
    })

    unsubs.push(
      shellClient.updater.onStatus((raw) => {
        const status = raw as UpdateStatus
        useAppStore.getState().setUpdateStatus(status)
      })
    )

    unsubs.push(
      shellClient.updater.onClearDismissal(() => {
        useAppStore.getState().clearDismissedUpdateVersion()
      })
    )

    unsubs.push(
      shellClient.ui.onFullscreenChanged((isFullScreen) => {
        useAppStore.getState().setIsFullScreen(isFullScreen)
      })
    )

    unsubs.push(
      browserShellEventsClient.onGuestLoadFailed(({ browserPageId, loadError }) => {
        if (isRuntimeEnvironmentActive()) {
          return
        }
        useAppStore.getState().updateBrowserPageState(browserPageId, {
          loading: false,
          loadError,
          canGoBack: false,
          canGoForward: false
        })
      })
    )

    const unsubscribeCertificateFailure = browserShellEventsClient.onCertificateFailureChanged(
      ({ browserPageId, failure }) => {
        if (isRuntimeEnvironmentActive()) {
          return
        }
        useAppStore.getState().setBrowserPageCertificateFailure(browserPageId, failure)
      }
    )
    if (unsubscribeCertificateFailure) {
      unsubs.push(unsubscribeCertificateFailure)
    }

    // Why: agent-browser drives navigation via CDP, bypassing Electron's webview
    // event system. The renderer's did-navigate listener never fires for those
    // navigations, so the Zustand store (address bar, tab title) stays stale.
    // This IPC pushes the live URL/title from main after goto/click/back/reload.
    unsubs.push(
      browserShellEventsClient.onNavigationUpdate(({ browserPageId, url, title }) => {
        if (isRuntimeEnvironmentActive()) {
          return
        }
        const store = useAppStore.getState()
        store.setBrowserPageUrl(browserPageId, url)
        store.updateBrowserPageState(browserPageId, { title, loading: false })
      })
    )

    // Why: browser webviews only start their guest process when the container
    // has display != none. Main sends this before browser automation commands
    // so persisted hidden tabs mount without changing the user's active pane.
    unsubs.push(
      browserShellEventsClient.onActivateView(({ worktreeId, browserPageId }) => {
        if (isRuntimeEnvironmentActive()) {
          return
        }
        acquireBrowserAutomationBootstrapLease(worktreeId, browserPageId)
      })
    )

    // Why: `yiru tab switch --focus` lands here after the bridge's state-only
    // `tabSwitch`. We deliberately DO NOT call `setActiveWorktree` — multiple
    // agents drive browsers in parallel worktrees, so a global focus call from
    // one agent's tab switch would steal the user's view from whichever
    // worktree they're actually reading. Instead `focusBrowserTabInWorktree`
    // updates the targeted worktree's per-worktree state in place; globals
    // (activeBrowserTabId, activeTabType) only flip when the user is already
    // on the targeted worktree. Cross-worktree --focus calls are silent
    // pre-staging for whenever the user next visits that worktree.
    unsubs.push(
      browserShellEventsClient.onPaneFocus(({ worktreeId, browserPageId }) => {
        if (isRuntimeEnvironmentActive()) {
          return
        }
        const store = useAppStore.getState()
        // Why: main sends `worktreeId: null` if the tab closed between the
        // bridge resolving tabSwitch and getWorktreeIdForTab running. Falling
        // back to activeWorktreeId means a stale page id in another worktree
        // is silently ignored by focusBrowserTabInWorktree (page not found
        // in its tabsForWorktree.find), which is the intended no-op.
        const targetWt = worktreeId ?? store.activeWorktreeId
        if (!targetWt) {
          return
        }
        store.focusBrowserTabInWorktree(targetWt, browserPageId)
      })
    )

    unsubs.push(
      browserShellEventsClient.onOpenLinkInYiruTab(({ browserPageId, url }) => {
        const store = useAppStore.getState()
        const sourcePage = Object.values(store.browserPagesByWorkspace)
          .flat()
          .find((page) => page.id === browserPageId)
        if (!sourcePage) {
          return
        }
        const runtimeEnvironmentId = getRuntimeEnvironmentIdForWorktree(
          store,
          sourcePage.worktreeId
        )
        // Why: the legacy event name describes its original behavior. Route
        // through the shared preference now so Browser guests match every
        // other user-content link without ever staging a blank tab.
        openHttpLink(url, {
          worktreeId: sourcePage.worktreeId,
          sourceOwner: runtimeEnvironmentId
            ? { kind: 'runtime', runtimeEnvironmentId }
            : { kind: 'local' }
        })
      })
    )

    // Shortcut forwarding for embedded browser guests whose webContents
    // capture keyboard focus and bypass the renderer's window-level keydown.
    unsubs.push(
      shellClient.ui.onNewBrowserTab(() => {
        const store = useAppStore.getState()
        if (isFloatingWorkspacePanelFocused()) {
          void createFloatingWorkspaceBrowserTab(store)
          return
        }
        const worktreeId = store.activeWorktreeId
        if (worktreeId) {
          const environmentId = getWorktreeRuntimeEnvironmentId(worktreeId)
          if (environmentId) {
            if (!isWebRuntimeSessionActive(environmentId)) {
              store.createBrowserTab(worktreeId, store.browserDefaultUrl ?? 'about:blank', {
                title: translate('auto.hooks.useIpcEvents.f6300deb8b', 'New Browser Tab'),
                focusAddressBar: true
              })
              return
            }
            void (async () => {
              // Why: paired web browser tabs are host-owned and arrive through
              // session.tabs. On RPC failure we leave local state unchanged so
              // the next host snapshot remains authoritative.
              await createWebRuntimeSessionBrowserTab({
                worktreeId,
                environmentId,
                url: store.browserDefaultUrl ?? 'about:blank'
              })
            })()
            return
          }
          store.createBrowserTab(worktreeId, store.browserDefaultUrl ?? 'about:blank', {
            title: translate('auto.hooks.useIpcEvents.f6300deb8b', 'New Browser Tab'),
            focusAddressBar: true
          })
        }
      })
    )

    unsubs.push(
      shellClient.ui.onNewMarkdownTab(() => {
        const store = useAppStore.getState()
        if (isFloatingWorkspacePanelFocused()) {
          void createFloatingWorkspaceMarkdownTab(store).catch((err) => {
            toast.error(
              err instanceof Error
                ? err.message
                : translate(
                    'auto.hooks.useIpcEvents.56d3ec4203',
                    'Failed to create untitled markdown file.'
                  )
            )
          })
          return
        }
        const worktreeId = store.activeWorktreeId
        if (!worktreeId) {
          return
        }
        const targetGroupId =
          store.activeGroupIdByWorktree[worktreeId] ?? store.groupsByWorktree[worktreeId]?.[0]?.id
        if (targetGroupId) {
          void store.openNewMarkdownInActiveWorkspace(targetGroupId)
        }
      })
    )

    // Why: emulator IPC is additive. Older clients should not crash the event
    // hook when this preload method is absent.
    const unsubscribeNewSimulatorTab = shellClient.ui.onNewSimulatorTab?.(() => {
      if (isRuntimeEnvironmentActive()) {
        return
      }
      const store = useAppStore.getState()
      const worktreeId = store.activeWorktreeId
      if (!worktreeId) {
        return
      }
      void openMobileEmulatorTab(worktreeId, { placement: 'rightSplit' })
    })
    if (unsubscribeNewSimulatorTab) {
      unsubs.push(unsubscribeNewSimulatorTab)
    }

    unsubs.push(
      subscribeEmulatorEvents({
        onAutoAttach: ({ worktreeId, info }) => {
          if (isManualSimulatorLaunchPending(worktreeId)) {
            // Why: manual launches pre-attach first so the ready pane can be
            // created in the right split instead of as a hidden tab in this group.
            rememberPrelaunchedSimulatorSession(worktreeId, info)
            return
          }
          ensureSimulatorTab(worktreeId, { surfacePane: false })
          // Why: watcher may detect a helper while a simulator tab is already mounted; push stream info so the pane updates without re-attach.
          window.setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent('yiru:emulator-auto-attach', {
                detail: { worktreeId, info }
              })
            )
          }, 0)
        },
        onPaneFocus: ({ worktreeId }) => {
          ensureSimulatorTab(worktreeId, { surfacePane: true })
        }
      })
    )

    unsubs.push(
      shellClient.ui.onNewTerminalTab(() => {
        const store = useAppStore.getState()
        if (isFloatingWorkspacePanelFocused()) {
          void createFloatingWorkspaceTerminalTab(store)
          return
        }
        const worktreeId = store.activeWorktreeId
        if (!worktreeId) {
          return
        }
        void (async () => {
          if (
            await createWebRuntimeSessionTerminal({
              worktreeId,
              environmentId: getWorktreeRuntimeEnvironmentId(worktreeId),
              activate: true
            })
          ) {
            return
          }
          const newTab = store.createTab(worktreeId)
          store.setActiveTabType('terminal')
          // Why: replicate the full reconciliation from terminal-workspace.tsx handleNewTab
          // so the new tab appends at the visual end instead of jumping to index 0
          // when tabBarOrderByWorktree is unset (e.g. restored worktrees).
          const freshStore = useAppStore.getState()
          const currentTerminals = freshStore.tabsByWorktree[worktreeId] ?? []
          const currentEditors = freshStore.openFiles.filter((f) => f.worktreeId === worktreeId)
          const currentBrowsers = freshStore.browserTabsByWorktree[worktreeId] ?? []
          const stored = freshStore.tabBarOrderByWorktree[worktreeId]
          const termIds = currentTerminals.map((t) => t.id)
          const editorIds = currentEditors.map((f) => f.id)
          const browserIds = currentBrowsers.map((tab) => tab.id)
          const validIds = new Set([...termIds, ...editorIds, ...browserIds])
          const base = (stored ?? []).filter((id) => validIds.has(id))
          const inBase = new Set(base)
          for (const id of [...termIds, ...editorIds, ...browserIds]) {
            if (!inBase.has(id)) {
              base.push(id)
              inBase.add(id)
            }
          }
          const order = base.filter((id) => id !== newTab.id)
          order.push(newTab.id)
          freshStore.setTabBarOrder(worktreeId, order)
          focusTerminalTabSurface(newTab.id)
        })()
      })
    )

    unsubs.push(
      shellClient.ui.onCloseActiveTab(() => {
        if (isEmptyFloatingWorkspacePanelVisible()) {
          window.dispatchEvent(new Event(TOGGLE_FLOATING_TERMINAL_EVENT))
          return
        }
        const store = useAppStore.getState()
        if (store.activeTabType === 'browser' && store.activeBrowserTabId) {
          const tabId = store.activeBrowserTabId
          const worktreeId = store.activeWorktreeId
          const closeActiveBrowserTab = (): void => {
            const currentStore = useAppStore.getState()
            const environmentId = getWorktreeRuntimeEnvironmentId(worktreeId)
            if (environmentId && worktreeId) {
              if (!isWebRuntimeSessionActive(environmentId)) {
                currentStore.closeBrowserTab(tabId)
                return
              }
              void closeWebRuntimeSessionTab({
                worktreeId,
                tabId,
                environmentId
              })
              return
            }
            currentStore.closeBrowserTab(tabId)
          }
          if (worktreeId && isPinnedSessionTab(store, worktreeId, tabId)) {
            guardPinnedTabClose({
              isPinned: true,
              tabLabel: resolvePinnedTabLabel(store, worktreeId, tabId),
              onClose: closeActiveBrowserTab
            })
            return
          }
          closeActiveBrowserTab()
        }
      })
    )

    unsubs.push(
      shellClient.ui.onSwitchTab((direction) => {
        const store = useAppStore.getState()
        if (isFloatingWorkspacePanelFocused()) {
          switchFloatingWorkspaceTab(store, direction, 'same-type')
          return
        }
        handleSwitchTab(direction)
      })
    )
    unsubs.push(
      shellClient.ui.onSwitchTabAcrossAllTypes((direction) => {
        const store = useAppStore.getState()
        if (isFloatingWorkspacePanelFocused()) {
          switchFloatingWorkspaceTab(store, direction, 'all-types')
          return
        }
        handleSwitchTabAcrossAllTypes(direction)
      })
    )
    unsubs.push(shellClient.ui.onSwitchRecentTab(handleSwitchRecentTab))
    unsubs.push(
      shellClient.ui.onSwitchTerminalTab((direction) => {
        const store = useAppStore.getState()
        if (isFloatingWorkspacePanelFocused()) {
          switchFloatingWorkspaceTab(store, direction, 'terminal')
          return
        }
        handleSwitchTerminalTab(direction)
      })
    )

    let initialRateLimitsSnapshotPending = true
    let receivedRateLimitsPushBeforeInitialSnapshot = false
    unsubs.push(
      subscribeRateLimitUpdates((state) => {
        if (initialRateLimitsSnapshotPending) {
          receivedRateLimitsPushBeforeInitialSnapshot = true
        }
        useAppStore.getState().setRateLimitsFromPush(state)
      })
    )
    // Why: the startup get is a fallback; a live push may already include
    // system-default account snapshots that an older get result lacks.
    fetchRateLimitSnapshot().then((state) => {
      initialRateLimitsSnapshotPending = false
      if (receivedRateLimitsPushBeforeInitialSnapshot) {
        return
      }
      useAppStore.getState().setRateLimitsFromPush(state)
    })

    unsubs.push(
      subscribeToWorkspaceSpaceScanProgress((progress) => {
        useAppStore.getState().applyWorkspaceSpaceProgress(progress)
      })
    )

    // Zoom handling for menu accelerators and keyboard fallback paths.
    unsubs.push(
      shellClient.ui.onTerminalZoom((direction) => {
        const store = useAppStore.getState()
        const { activeView, activeTabType, editorFontZoomLevel, setEditorFontZoomLevel, settings } =
          store
        const target = resolveZoomTarget({
          activeView,
          activeTabType,
          activeElement: document.activeElement
        })
        if (target === 'terminal') {
          return
        }
        if (target === 'editor') {
          const next = nextEditorFontZoomLevel(editorFontZoomLevel, direction)
          setEditorFontZoomLevel(next)
          void setRuntimeUIState(settings, { editorFontZoomLevel: next })

          // Why: use the same base font size the editor surfaces use (terminalFontSize)
          // and computeEditorFontSize to account for clamping, so the overlay percent
          // matches the actual rendered size.
          const baseFontSize = settings?.terminalFontSize ?? 13
          const actual = computeEditorFontSize(baseFontSize, next)
          const percent = Math.round((actual / baseFontSize) * 100)
          dispatchZoomLevelChanged('editor', percent)
          return
        }

        const current = shellClient.ui.getZoomLevel()
        const rawNext =
          direction === 'in' ? current + ZOOM_STEP : direction === 'out' ? current - ZOOM_STEP : 0
        const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, rawNext))

        applyUIZoom(next)
        void setRuntimeUIState(settings, { uiZoomLevel: next })

        dispatchZoomLevelChanged('ui', zoomLevelToPercent(next))
      })
    )

    // Why: agent status arrives from native hook receivers in the main process.
    // Re-parse it here so the renderer enforces the same normalization rules
    // (state enum, field truncation) regardless of whether the source was a
    // hook callback or an OSC fallback path. Startup pushes are ignored until
    // workspace hydration; the snapshot pull and bounded queue bridge any
    // remaining tab/layout hydration race.
    function schedulePendingAgentStatusFlush(): void {
      if (pendingAgentStatusRetryTimer !== null || pendingAgentStatusEvents.length === 0) {
        return
      }
      pendingAgentStatusRetryTimer = globalThis.setTimeout(() => {
        pendingAgentStatusRetryTimer = null
        flushPendingAgentStatuses()
      }, PENDING_AGENT_STATUS_RETRY_MS)
    }

    function enqueuePendingAgentStatus(
      data: AgentStatusIpcPayload,
      options?: { replay?: boolean }
    ): void {
      pendingAgentStatusEvents.push({
        data,
        firstSeenAt: Date.now(),
        replay: options?.replay === true
      })
      while (pendingAgentStatusEvents.length > MAX_PENDING_AGENT_STATUS_EVENTS) {
        pendingAgentStatusEvents.shift()
      }
      schedulePendingAgentStatusFlush()
    }

    function flushPendingAgentStatuses(): void {
      // Why: a re-entrant call (store subscriber firing during a setAgentStatus
      // inside the loop below) must not reprocess the still-queued events — the
      // outer flush already owns them. Bailing here breaks the infinite
      // recursion without dropping work; the outer loop finishes the drain.
      if (isFlushingAgentStatuses) {
        return
      }
      if (pendingAgentStatusEvents.length === 0) {
        return
      }
      isFlushingAgentStatuses = true
      try {
        const remaining = retryPendingAgentStatusEvents(pendingAgentStatusEvents, {
          now: Date.now(),
          ttlMs: PENDING_AGENT_STATUS_TTL_MS,
          apply: applyAgentStatus
        })
        pendingAgentStatusEvents.length = 0
        pendingAgentStatusEvents.push(...remaining)
        if (pendingAgentStatusEvents.length === 0 && pendingAgentStatusRetryTimer !== null) {
          globalThis.clearTimeout(pendingAgentStatusRetryTimer)
          pendingAgentStatusRetryTimer = null
        }
      } finally {
        isFlushingAgentStatuses = false
      }
      schedulePendingAgentStatusFlush()
    }

    const applyAgentStatus = (
      data: AgentStatusIpcPayload,
      options?: { replay?: boolean; retry?: boolean }
    ): AgentStatusApplyResult => {
      const store = useAppStore.getState()
      if (!store.workspaceSessionReady) {
        return 'dropped'
      }
      if (isAgentStatusForRecentlyClosedTab(store, data.paneKey)) {
        return 'dropped'
      }
      const paneKey = resolveAgentPaneAuthorityKey(data.paneKey)
      const ownerTabId = parsePaneKey(paneKey)?.tabId ?? data.tabId
      const payload = normalizeAgentStatusPayload({
        state: data.state,
        prompt: data.prompt,
        agentType: data.agentType,
        model: data.model,
        toolName: data.toolName,
        toolInput: data.toolInput,
        // Why: the live AskUserQuestion prompt rides this IPC field; omitting it
        // here silently dropped the native question card on web/mobile clients.
        interactivePrompt: data.interactivePrompt,
        lastAssistantMessage: data.lastAssistantMessage,
        interrupted: data.interrupted,
        // Why: same trap as interactivePrompt — this rebuild is a field
        // whitelist, so the subagent child rows vanish if omitted here.
        subagents: data.subagents
      })
      if (!payload) {
        return 'dropped'
      }
      let {
        exists,
        title,
        identityTitle,
        repoConnectionId,
        repoConnectionResolved,
        owningWorktreeId
      } = resolvePaneKey(store, paneKey)
      if (!exists && data.worktreeId === FRIDAY_WORKTREE_ID) {
        // Why: assistant hooks may arrive before its hidden PTY is adopted by
        // the floating tab; native chat still needs the hook-owned provider id.
        exists = true
        owningWorktreeId = FRIDAY_WORKTREE_ID
        repoConnectionId = null
        repoConnectionResolved = true
      }
      if (!exists && hasRuntimeBackedAgentStatusAttribution(data)) {
        // Why: orchestration worker hooks can carry main-side worktree
        // attribution before this renderer has a terminal tab for the pane.
        // Require runtime identity too; durable snapshots with only worktreeId
        // can be stale cached rows from closed/remounted panes.
        const fallbackOwnership = resolveWorktreeConnection(store, data.worktreeId)
        if (fallbackOwnership.worktreeExists) {
          owningWorktreeId = data.worktreeId
          repoConnectionId = fallbackOwnership.repoConnectionId
          repoConnectionResolved = fallbackOwnership.repoConnectionResolved
          exists = true
        }
      }
      if (!exists) {
        // Why: runtime-backed startup snapshots can arrive before tab/layout
        // hydration; keep their replay semantics while the pane catches up.
        if (options?.replay === true) {
          if (hasRuntimeBackedAgentStatusAttribution(data)) {
            if (options?.retry !== true) {
              enqueuePendingAgentStatus(data, { replay: true })
            }
            return 'pending'
          }
          return 'dropped'
        }
        if (options?.retry !== true) {
          // Why: a live hook with no matching renderer pane is either a brief
          // hydration race or a routing failure worth tracking once.
          track('agent_hook_unattributed', { reason: 'unknown_tab_id' })
          enqueuePendingAgentStatus(data)
        }
        return 'pending'
      }
      if (options?.replay !== true && options?.retry !== true) {
        for (let index = pendingAgentStatusEvents.length - 1; index >= 0; index -= 1) {
          if (pendingAgentStatusEvents[index].data.paneKey === data.paneKey) {
            pendingAgentStatusEvents.splice(index, 1)
          }
        }
      }
      // Why: drop in-flight events from a connection that no longer owns
      // this pane. After an SSH disconnect (or tab destroy/recreate during
      // reconnect), notifications may still arrive stamped with the
      // connectionId of the dead connection. The renderer compares the
      // stamped connectionId against the live repo's connectionId for the
      // pane's worktree — see docs/design/agent-status-over-ssh.md §5.
      // The IPC contract declares connectionId as required (string | null),
      // so the undefined branch only fires under dev hot-reload skew where
      // the renderer bundle is newer than the preload bundle.
      // Why: startup snapshot replay can beat repo/worktree hydration for SSH
      // panes. If the pane is already present and the event's worktreeId
      // matches that tab's worktree, accept the status until repo ownership
      // becomes available; once ownership is resolved, keep the strict
      // connectionId check below.
      // Why: the WSL hook relay stamps a transport-provenance connectionId
      // (`wsl:<distro>`), but the pane is a LOCAL pane on a local repo —
      // ownership-wise it is null. Without this normalization the strict
      // check below drops every WSL-relayed status for a local repo (while
      // still rejecting WSL-stamped events against SSH-owned repos).
      const ownershipConnectionId = isWslHookRelayConnectionId(data.connectionId)
        ? null
        : data.connectionId
      const canAcceptPendingRemoteOwnership =
        ownershipConnectionId !== undefined &&
        ownershipConnectionId !== null &&
        !repoConnectionResolved &&
        data.worktreeId !== undefined &&
        data.worktreeId === owningWorktreeId
      if (
        ownershipConnectionId !== undefined &&
        ownershipConnectionId !== repoConnectionId &&
        !canAcceptPendingRemoteOwnership
      ) {
        return 'dropped'
      }
      const existingStatus = store.agentStatusByPaneKey[paneKey]
      if (existingStatus && data.receivedAt < existingStatus.updatedAt) {
        // Why: metadata-only identity and visible statuses must share the same
        // accepted-event boundary so stale startup events cannot win.
        return 'dropped'
      }
      if (data.providerSessionOnly) {
        if (!data.providerSession || data.agentType !== 'pi') {
          return 'dropped'
        }
        store.recordAgentProviderSession(
          paneKey,
          'pi',
          data.providerSession,
          { updatedAt: data.receivedAt },
          {
            tabId: ownerTabId,
            worktreeId: data.worktreeId ?? owningWorktreeId,
            // Why: persist WSL-normalized ownership, not relay provenance,
            // so a later resume stays on the local worktree connection.
            ...(ownershipConnectionId !== undefined ? { connectionId: ownershipConnectionId } : {})
          },
          data.launchToken ? { launchToken: data.launchToken } : undefined
        )
        return 'applied'
      }
      const resolvedPayload = resolveHookPayloadAgentType(payload, identityTitle ?? title)
      const statusPayload = data.orchestration
        ? { ...resolvedPayload, orchestration: data.orchestration }
        : resolvedPayload
      const statusPayloadWithTurnBoundary = data.promptInteractionKey
        ? { ...statusPayload, promptInteractionKey: data.promptInteractionKey }
        : statusPayload
      const identity = resolveAgentStatusIdentity({
        existing: existingStatus
          ? {
              agentType: existingStatus.agentType,
              state: existingStatus.state,
              updatedAt: existingStatus.updatedAt
            }
          : undefined,
        incoming: statusPayload.agentType,
        now: data.receivedAt
      })
      if (
        existingStatus &&
        shouldSuppressInheritedTerminalStatus({
          inheritedFromActivePane: identity.inheritedFromActivePane,
          incomingState: statusPayload.state
        })
      ) {
        // Why: renderer may receive an old/stale main-process child completion.
        // Keep the defensive store guard and completion notification path in sync.
        return 'dropped'
      }
      if (
        shouldSuppressCodexAutoApprovalStatus(statusPayload, {
          paneKey,
          tabId: ownerTabId,
          terminalHandle: data.terminalHandle,
          launchToken: data.launchToken,
          providerSession: data.providerSession,
          existingProviderSession: existingStatus?.providerSession
        })
      ) {
        // Why: Codex yolo permission hooks are not user-actionable, and must
        // not drive status, synthetic titles, unread badges, or notifications.
        return 'dropped'
      }
      const terminalTitle = resolveAgentStatusTerminalTitle(statusPayload, title)
      const statusWorktreeId = data.worktreeId ?? owningWorktreeId
      store.setAgentStatus(
        paneKey,
        statusPayloadWithTurnBoundary,
        terminalTitle,
        {
          updatedAt: data.receivedAt,
          stateStartedAt: data.stateStartedAt
        },
        {
          tabId: ownerTabId,
          worktreeId: statusWorktreeId,
          terminalHandle: data.terminalHandle,
          // Why: provider resume metadata is host-owned; carry normalized
          // ownership into the durable cold-restore record.
          ...(ownershipConnectionId !== undefined ? { connectionId: ownershipConnectionId } : {})
        },
        data.providerSession || data.launchToken
          ? {
              ...(data.providerSession ? { providerSession: data.providerSession } : {}),
              ...(data.launchToken ? { launchToken: data.launchToken } : {})
            }
          : undefined
      )
      applyResolvedAgentTerminalTitleToTab(store, paneKey, title, terminalTitle)
      if (options?.replay !== true && statusWorktreeId) {
        // Why: local Codex/Claude hooks arrive through this main-process IPC
        // path, not the PTY OSC fallback, so task-complete notifications must
        // observe accepted hook state here as well.
        const notificationPayload =
          typeof data.stateStartedAt === 'number'
            ? { ...resolvedPayload, stateStartedAt: data.stateStartedAt }
            : resolvedPayload
        observeAgentHookCompletionForNotification({
          paneKey,
          worktreeId: statusWorktreeId,
          payload: notificationPayload
        })
      }
      return 'applied'
    }

    let snapshotRequestedForReadyWindow = false
    let snapshotRequestId = 0
    const requestAgentStatusSnapshotIfReady = (): void => {
      const store = useAppStore.getState()
      if (!store.workspaceSessionReady) {
        snapshotRequestedForReadyWindow = false
        return
      }
      if (snapshotRequestedForReadyWindow) {
        return
      }
      snapshotRequestedForReadyWindow = true
      const requestId = ++snapshotRequestId
      void getAgentStatusSnapshot()
        .then((entries) => {
          if (requestId !== snapshotRequestId) {
            return
          }
          const current = useAppStore.getState()
          if (!current.workspaceSessionReady) {
            return
          }
          for (const entry of entries) {
            applyAgentStatus(entry, { replay: true })
          }
          void getMigrationUnsupportedAgentStatusSnapshot().then((unsupportedEntries) => {
            const unsupportedStore = useAppStore.getState()
            if (!unsupportedStore.workspaceSessionReady) {
              return
            }
            for (const entry of unsupportedEntries) {
              if (entry.paneKey && resolvePaneKey(unsupportedStore, entry.paneKey).exists) {
                unsupportedStore.setMigrationUnsupportedPty(entry)
              }
            }
          })
        })
        .catch((err) => {
          // Why: keep snapshotRequestedForReadyWindow latched on failure. The
          // store subscriber below fires on every update (including high-rate
          // PTY ticks), so resetting the flag here would turn a persistent IPC
          // failure into an unbounded retry storm. One warning per ready
          // window is sufficient; the flag still clears when
          // workspaceSessionReady toggles off, so a fresh workspace re-ready
          // cycle will retry.
          console.warn('[agent-status] failed to load startup snapshot:', err)
        })
    }

    unsubs.push(
      subscribeAgentStatusEvents({
        onReady: (snapshot) => {
          for (const status of snapshot.statuses) {
            applyAgentStatus(status, { replay: true })
          }
          const store = useAppStore.getState()
          if (!store.workspaceSessionReady) {
            return
          }
          for (const entry of snapshot.migrationUnsupportedPtys) {
            if (entry.paneKey && resolvePaneKey(store, entry.paneKey).exists) {
              store.setMigrationUnsupportedPty(entry)
            }
          }
        },
        onSet: applyAgentStatus,
        onClear: (paneKey) => {
          const store = useAppStore.getState()
          if (store.agentStatusByPaneKey[paneKey]?.state === 'done') {
            return
          }
          store.removeAgentStatus(paneKey)
        },
        onMigrationUnsupported: (entry) => {
          const store = useAppStore.getState()
          if (!store.workspaceSessionReady) {
            return
          }
          if (entry.paneKey && resolvePaneKey(store, entry.paneKey).exists) {
            store.setMigrationUnsupportedPty(entry)
          }
        },
        onMigrationUnsupportedClear: (ptyId) => {
          useAppStore.getState().clearMigrationUnsupportedPty(ptyId)
        }
      })
    )

    // Why: the main hook server is durable truth. Pull once workspace hydration
    // is ready; the bounded pane retry queue handles layouts that still lag.
    requestAgentStatusSnapshotIfReady()
    unsubs.push(
      useAppStore.subscribe((state, previousState) => {
        requestAgentStatusSnapshotIfReady()
        flushPendingAgentStatuses()
        syncAgentHookCompletionNotificationsForStoreUpdate(state, previousState)
      })
    )

    let mobileStateHydrated = isRuntimeEnvironmentActive()
    type PendingMobileStateEvent =
      | {
          kind: 'fit'
          event: {
            ptyId: string
            mode: 'mobile-fit' | 'remote-desktop-fit' | 'desktop-fit'
            cols: number
            rows: number
          }
        }
      | {
          kind: 'driver'
          event: {
            ptyId: string
            driver: RuntimeTerminalDriverState
          }
        }
      | {
          kind: 'browser-driver'
          event: {
            browserPageId: string
            driver: RuntimeBrowserDriverState
          }
        }
    const pendingMobileStateEvents: PendingMobileStateEvent[] = []
    let mobileStateHydrationDisposed = false
    let mobileStateHydrationRequestId = 0

    const applyPendingMobileStateEvents = (): void => {
      for (const pending of pendingMobileStateEvents) {
        if (pending.kind === 'fit') {
          const { ptyId, mode, cols, rows } = pending.event
          setFitOverride(ptyId, mode, cols, rows)
        } else if (pending.kind === 'driver') {
          setDriverForPty(pending.event.ptyId, pending.event.driver)
        } else {
          setDriverForBrowserPage(pending.event.browserPageId, pending.event.driver)
        }
      }
      pendingMobileStateEvents.length = 0
    }

    const enqueuePendingMobileStateEvent = (event: PendingMobileStateEvent): void => {
      pendingMobileStateEvents.push(event)
      while (pendingMobileStateEvents.length > MAX_PENDING_MOBILE_STATE_EVENTS) {
        pendingMobileStateEvents.shift()
      }
    }

    const hydrateMobileDriverState = (): void => {
      if (isRuntimeEnvironmentActive()) {
        return
      }
      const requestId = ++mobileStateHydrationRequestId
      mobileStateHydrated = false
      pendingMobileStateEvents.length = 0
      void Promise.all([
        shellClient.runtime.getTerminalFitOverrides(),
        shellClient.runtime.getTerminalDrivers(),
        shellClient.runtime.getBrowserDrivers()
      ])
        .then(([overrides, drivers, browserDrivers]) => {
          if (mobileStateHydrationDisposed || requestId !== mobileStateHydrationRequestId) {
            return
          }
          hydrateOverrides(overrides)
          hydrateDrivers(drivers)
          hydrateBrowserDrivers(browserDrivers)
          mobileStateHydrated = true
          applyPendingMobileStateEvents()
        })
        .catch((error: unknown) => {
          if (mobileStateHydrationDisposed || requestId !== mobileStateHydrationRequestId) {
            return
          }
          console.error('Failed to hydrate mobile terminal state:', error)
          mobileStateHydrated = true
          applyPendingMobileStateEvents()
        })
    }

    unsubs.push(
      subscribeRuntimeDriverEvents({
        // Why: the host emits ready only after registering its driver listener.
        // Starting snapshot hydration here preserves the old subscribe-before-fetch
        // guarantee even though opening an oRPC stream is asynchronous.
        onReady: hydrateMobileDriverState,
        onEvent: (event) => {
          if (isRuntimeEnvironmentActive()) {
            return
          }
          switch (event.type) {
            case 'terminalFitOverrideChanged':
              if (mobileStateHydrated) {
                setFitOverride(event.ptyId, event.mode, event.cols, event.rows)
              } else {
                enqueuePendingMobileStateEvent({ kind: 'fit', event })
              }
              return
            case 'terminalDriverChanged':
              if (mobileStateHydrated) {
                // Why: the presence-lock map drives terminal input guards and
                // its active-mobile banner. See docs/mobile-presence-lock.md.
                setDriverForPty(event.ptyId, event.driver)
              } else {
                enqueuePendingMobileStateEvent({ kind: 'driver', event })
              }
              return
            case 'browserDriverChanged':
              if (mobileStateHydrated) {
                setDriverForBrowserPage(event.browserPageId, event.driver)
              } else {
                enqueuePendingMobileStateEvent({ kind: 'browser-driver', event })
              }
          }
        }
      })
    )

    return () => {
      if (pendingAgentStatusRetryTimer !== null) {
        globalThis.clearTimeout(pendingAgentStatusRetryTimer)
      }
      pendingAgentStatusEvents.length = 0
      mobileStateHydrationDisposed = true
      pendingMobileStateEvents.length = 0
      unsubs.forEach((fn) => fn())
      resetAgentHookCompletionNotificationCoordinators()
    }
  }, [])
}

function applyResolvedAgentTerminalTitleToTab(
  store: ReturnType<typeof useAppStore.getState>,
  paneKey: string,
  previousTitle: string | undefined,
  nextTitle: string | undefined
): void {
  if (!nextTitle || nextTitle === previousTitle) {
    return
  }
  const parsed = parsePaneKey(paneKey)
  if (!parsed) {
    return
  }
  const layout = store.terminalLayoutsByTabId?.[parsed.tabId]
  if (layout?.root && layout.activeLeafId && layout.activeLeafId !== parsed.leafId) {
    return
  }
  // Why: hook completion can arrive while the pane transport is unmounted.
  // Keep the active terminal tab label in sync with the resolved state title.
  store.updateTabTitle(parsed.tabId, nextTitle)
}

/** Resolve a paneKey (tabId:leafId) to both a liveness check and the current
 *  title, the pane's worktree, and the connectionId of the repo that owns it.
 *  Walks tabsByWorktree to locate the tab, then resolves the owning worktree
 *  and repo via cached selector maps. Used for agent type inference when the
 *  CLI payload omits agentType, plus to drop status updates targeted at panes
 *  whose tabs have already been torn down or whose owning connection is no
 *  longer live (see docs/design/agent-status-over-ssh.md §5).
 *  Why combined: callers need all routing pieces per hook event, and hook
 *  events can fire many times per second during a tool-use run. Bundling
 *  liveness + title + connectionId into one helper keeps the per-event work
 *  in one place and avoids re-deriving the owning repo at the call site. */
function resolvePaneKey(
  store: ReturnType<typeof useAppStore.getState>,
  paneKey: string
): {
  exists: boolean
  title: string | undefined
  identityTitle: string | undefined
  repoConnectionId: string | null
  repoConnectionResolved: boolean
  owningWorktreeId: string | undefined
} {
  const parsed = parsePaneKey(paneKey)
  if (!parsed) {
    return {
      exists: false,
      title: undefined,
      identityTitle: undefined,
      repoConnectionId: null,
      repoConnectionResolved: false,
      owningWorktreeId: undefined
    }
  }
  const { tabId, leafId } = parsed
  const layout = store.terminalLayoutsByTabId?.[tabId]
  let exists = false
  let tabTitle: string | undefined
  let unifiedTabLabel: string | undefined
  let owningWorktreeId: string | undefined
  for (const [worktreeId, tabs] of Object.entries(store.tabsByWorktree)) {
    for (const tab of tabs) {
      if (tab.id === tabId) {
        exists = true
        tabTitle = tab.title
        owningWorktreeId = worktreeId
        const visibleTab = (store.unifiedTabsByWorktree?.[worktreeId] ?? []).find(
          (entry) => entry.contentType === 'terminal' && entry.entityId === tabId
        )
        const rawVisibleLabel = visibleTab?.label?.trim()
        unifiedTabLabel =
          rawVisibleLabel && rawVisibleLabel.length > 0 ? rawVisibleLabel : undefined
        break
      }
    }
    if (exists) {
      break
    }
  }
  // Why: ownership lookup is `tab → worktree → repo`. Keep "resolved to a
  // local repo" distinct from "not hydrated yet" so the caller can preserve
  // strict filtering after hydration while accepting SSH snapshots that
  // arrive during the startup ownership gap. repo.connectionId is dead —
  // nothing sets it since remote hosts were removed (#63) — so
  // repoConnectionId always stays null once resolved.
  const repoConnectionId: string | null = null
  let repoConnectionResolved = false
  if (owningWorktreeId !== undefined) {
    const worktree = getWorktreeMapFromState(store).get(owningWorktreeId)
    if (worktree) {
      const repo = getRepoMapFromState(store).get(worktree.repoId)
      repoConnectionResolved = repo !== undefined
    }
  }
  if (!exists) {
    return {
      exists: false,
      title: undefined,
      identityTitle: undefined,
      repoConnectionId,
      repoConnectionResolved,
      owningWorktreeId
    }
  }
  // Why: inactive worktree switches can leave the tab's layout at the empty
  // snapshot while the tab and PTY are still live. Treat that like missing
  // layout metadata; a non-empty layout that lacks the leaf still means closed.
  const leafExists = layout?.root ? collectLeafIdsInOrder(layout.root).includes(leafId) : true
  if (!leafExists) {
    return {
      exists: false,
      title: undefined,
      identityTitle: undefined,
      repoConnectionId,
      repoConnectionResolved,
      owningWorktreeId
    }
  }
  // Why: inactive worktrees can have a durable tab and live PTY while their
  // terminal layout is temporarily unmounted. Hook state must still land there.
  const rawPaneTitle = layout?.titlesByLeafId?.[leafId]
  // Why: treat an empty-string paneTitle as "no title" so the tab-level
  // fallback still fires. `paneTitle ?? tabTitle` alone would short-circuit on
  // '' and also erase any previously-cached terminalTitle in the store
  // (`terminalTitle ?? existing?.terminalTitle` resolves to '').
  const paneTitle = rawPaneTitle && rawPaneTitle.length > 0 ? rawPaneTitle : undefined
  return {
    exists,
    title: paneTitle ?? tabTitle,
    // Why: some agents (OpenClaude in practice) keep the low-level terminal
    // title generic while the unified tab label carries the launched agent
    // identity. Use only the non-custom label as evidence for hook attribution.
    identityTitle: paneTitle ?? unifiedTabLabel ?? tabTitle,
    repoConnectionId,
    repoConnectionResolved,
    owningWorktreeId
  }
}

function resolveWorktreeConnection(
  store: ReturnType<typeof useAppStore.getState>,
  worktreeId: string
): {
  worktreeExists: boolean
  repoConnectionId: string | null
  repoConnectionResolved: boolean
} {
  const worktree = getWorktreeMapFromState(store).get(worktreeId)
  if (!worktree) {
    return { worktreeExists: false, repoConnectionId: null, repoConnectionResolved: false }
  }
  const repo = getRepoMapFromState(store).get(worktree.repoId)
  // Why: Repo.connectionId is dead — nothing sets it since remote hosts were
  // removed (#63) — a resolved repo's connection is always null.
  return {
    worktreeExists: true,
    repoConnectionId: null,
    repoConnectionResolved: repo !== undefined
  }
}

function resolveHookPayloadAgentType(
  payload: ParsedAgentStatusPayload,
  terminalTitle: string | undefined
): ParsedAgentStatusPayload {
  if (
    payload.agentType !== 'claude' ||
    !terminalTitle ||
    !titleHasAgentName(terminalTitle, 'openclaude')
  ) {
    return payload
  }
  // Why: OpenClaude emits Claude-compatible hooks, so title identity is the
  // renderer's last chance to keep OpenClaude out of Claude-only status paths.
  return { ...payload, agentType: 'openclaude' }
}
