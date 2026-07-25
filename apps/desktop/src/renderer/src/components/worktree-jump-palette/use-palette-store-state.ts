import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { selectWorktreePaletteCacheInputs } from '@/components/cmd-j/worktree-palette-cache-inputs'
import { useSettingsNavigationMetadata } from '@/components/settings/use-navigation-metadata'
import { useAppStore } from '@/store'
import { useAllWorktrees } from '@/store/selectors'

import { selectPaletteStatusInputs } from '../worktree-jump-palette-status-inputs'

// Why: comfortably outlast the CommandDialog close animation (~150–200ms) so the
// gated status maps stay live until the fading rows are gone from the DOM.
const PALETTE_STATUS_INPUTS_LINGER_MS = 300

// Why: every piece of store state the jump palette reads, gathered in one hook
// so the search/selection/render modules stay purely prop-driven and testable
// against plain data rather than the live store.
export function usePaletteStoreState() {
  // Why: subscribe this palette to language changes; translated memo contents
  // recompute on the rerender without using i18n.language as a fake dependency.
  useTranslation()
  const visible = useAppStore((s) => s.activeModal === 'worktree-palette')
  const closeModal = useAppStore((s) => s.closeModal)
  const openModal = useAppStore((s) => s.openModal)
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)
  const revealSidebarRow = useAppStore((s) => s.revealSidebarRow)
  const worktreesByRepo = useAppStore((s) => s.worktreesByRepo)
  const allWorktrees = useAllWorktrees()
  const repos = useAppStore((s) => s.repos)
  const projectGroups = useAppStore((s) => s.projectGroups)
  const projects = useAppStore((s) => s.projects)
  const projectHostSetups = useAppStore((s) => s.projectHostSetups)
  const detectedWorktreesByRepo = useAppStore((s) => s.detectedWorktreesByRepo)
  const pendingWorktreeCreations = useAppStore((s) => s.pendingWorktreeCreations)
  // Why: keep the (very hot) status maps subscribed through the dialog's close
  // animation. `visible` flips false synchronously on close, but the CommandDialog
  // content stays mounted while it fades/zooms out — dropping the maps to empty
  // there would flash the switcher rows empty/reordered mid-animation. Linger a
  // beat past close, then let the gate drop the subscription.
  const [statusInputsLingering, setStatusInputsLingering] = useState(false)
  useEffect(() => {
    if (visible) {
      setStatusInputsLingering(true)
      return
    }
    const timer = window.setTimeout(
      () => setStatusInputsLingering(false),
      PALETTE_STATUS_INPUTS_LINGER_MS
    )
    return () => window.clearTimeout(timer)
  }, [visible])
  // Why: these five status maps drive per-worktree live/working dots and the
  // switcher sort, but only matter while the palette is active. Two of them
  // (agentStatusByPaneKey, runtimePaneTitlesByTabId) get a new identity on every
  // agent-status / pane-title write app-wide, so subscribing to them while the
  // always-mounted palette is closed re-rendered it on unrelated terminals. Gate
  // the subscription on active-or-still-closing: a shared frozen constant while
  // inactive keeps useShallow referentially equal across the churn, and the live
  // maps flow through the instant the palette opens.
  // - runtimePaneTitlesByTabId: split-pane tabs with a working agent in a
  //   non-focused pane still surface as 'working' (matches the sidebar spinner).
  // - ptyIdsByTabId: the live-pty source of truth — slept tabs keep a wake-hint
  //   sessionId in tab.ptyId, so without it the palette dot would lie green.
  const {
    agentStatusByPaneKey,
    runtimePaneTitlesByTabId,
    ptyIdsByTabId,
    terminalLayoutsByTabId,
    tabsByWorktree
  } = useAppStore(useShallow((s) => selectPaletteStatusInputs(s, visible || statusInputsLingering)))
  const agentStatusEpoch = useAppStore((s) =>
    visible || statusInputsLingering ? s.agentStatusEpoch : 0
  )
  const { prCache, hostedReviewCache } = useAppStore(
    useShallow((s) => selectWorktreePaletteCacheInputs(s, visible || statusInputsLingering))
  )
  const migrationUnsupportedByPtyId = useAppStore((s) => s.migrationUnsupportedByPtyId)
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const activeTabType = useAppStore((s) => s.activeTabType)
  const activeTabId = useAppStore((s) => s.activeTabId)
  const activeTabIdByWorktree = useAppStore((s) => s.activeTabIdByWorktree)
  const activeFileId = useAppStore((s) => s.activeFileId)
  const activeFileIdByWorktree = useAppStore((s) => s.activeFileIdByWorktree)
  const activeTabTypeByWorktree = useAppStore((s) => s.activeTabTypeByWorktree)
  const activeBrowserTabId = useAppStore((s) => s.activeBrowserTabId)
  const browserTabsByWorktree = useAppStore((s) => s.browserTabsByWorktree)
  const browserPagesByWorkspace = useAppStore((s) => s.browserPagesByWorkspace)
  const unifiedTabsByWorktree = useAppStore((s) => s.unifiedTabsByWorktree)
  const openFiles = useAppStore((s) => s.openFiles)
  const activeGroupIdByWorktree = useAppStore((s) => s.activeGroupIdByWorktree)
  const groupsByWorktree = useAppStore((s) => s.groupsByWorktree)
  const retainedAgentsByPaneKey = useAppStore((s) => s.retainedAgentsByPaneKey)
  const sleepingAgentSessionsByPaneKey = useAppStore((s) => s.sleepingAgentSessionsByPaneKey)
  const settings = useAppStore((s) => s.settings)
  const sshTargetLabels = useAppStore((s) => s.sshTargetLabels)
  const sshConnectionStates = useAppStore((s) => s.sshConnectionStates)
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const runtimeStatusByEnvironmentId = useAppStore((s) => s.runtimeStatusByEnvironmentId)
  const hideDefaultBranchWorkspace = useAppStore((s) => s.hideDefaultBranchWorkspace)
  const hideAutomationGeneratedWorkspaces = useAppStore((s) => s.hideAutomationGeneratedWorkspaces)
  const showSleepingWorkspaces = useAppStore((s) => s.showSleepingWorkspaces)
  const lastVisitedAtByWorktreeId = useAppStore((s) => s.lastVisitedAtByWorktreeId)
  const workspacePortScan = useAppStore((s) => s.workspacePortScan?.result ?? null)
  const openNewBrowserTabInActiveWorkspace = useAppStore(
    (s) => s.openNewBrowserTabInActiveWorkspace
  )
  const openNewMarkdownInActiveWorkspace = useAppStore((s) => s.openNewMarkdownInActiveWorkspace)
  const openNewTerminalTabInActiveWorkspace = useAppStore(
    (s) => s.openNewTerminalTabInActiveWorkspace
  )
  const settingsSections = useSettingsNavigationMetadata()

  return {
    visible,
    closeModal,
    openModal,
    openSettingsPage,
    openSettingsTarget,
    recordFeatureInteraction,
    revealSidebarRow,
    worktreesByRepo,
    allWorktrees,
    repos,
    projectGroups,
    projects,
    projectHostSetups,
    detectedWorktreesByRepo,
    pendingWorktreeCreations,
    agentStatusByPaneKey,
    runtimePaneTitlesByTabId,
    ptyIdsByTabId,
    terminalLayoutsByTabId,
    tabsByWorktree,
    agentStatusEpoch,
    prCache,
    hostedReviewCache,
    migrationUnsupportedByPtyId,
    activeWorktreeId,
    activeTabType,
    activeTabId,
    activeTabIdByWorktree,
    activeFileId,
    activeFileIdByWorktree,
    activeTabTypeByWorktree,
    activeBrowserTabId,
    browserTabsByWorktree,
    browserPagesByWorkspace,
    unifiedTabsByWorktree,
    openFiles,
    activeGroupIdByWorktree,
    groupsByWorktree,
    retainedAgentsByPaneKey,
    sleepingAgentSessionsByPaneKey,
    settings,
    sshTargetLabels,
    sshConnectionStates,
    runtimeEnvironments,
    runtimeStatusByEnvironmentId,
    hideDefaultBranchWorkspace,
    hideAutomationGeneratedWorkspaces,
    showSleepingWorkspaces,
    lastVisitedAtByWorktreeId,
    workspacePortScan,
    openNewBrowserTabInActiveWorkspace,
    openNewMarkdownInActiveWorkspace,
    openNewTerminalTabInActiveWorkspace,
    settingsSections
  }
}

export type PaletteStoreState = ReturnType<typeof usePaletteStoreState>
