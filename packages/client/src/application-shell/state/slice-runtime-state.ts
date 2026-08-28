import type {
  ChangelogData,
  PersistedUIState,
  UpdateStatus
} from '@yiru/runtime-protocol/workbench/types'
import type { WorkspacePortScanResult } from '@yiru/runtime-protocol/workbench/workspace/ports'

import type { PendingSidebarRowReveal, PendingSidebarWorktreeReveal } from './slice'

export type UIRuntimeState = {
  workspacePortScan: { key: string; result: WorkspacePortScanResult } | null
  workspacePortScansByKey: Record<string, WorkspacePortScanResult>
  workspacePortScanRefreshing: boolean
  setWorkspacePortScan: (scan: { key: string; result: WorkspacePortScanResult } | null) => void
  setWorkspacePortScanProjection: (
    scan: { key: string; result: WorkspacePortScanResult } | null
  ) => void
  replaceWorkspacePortScans: (
    scansByKey: Record<string, WorkspacePortScanResult>,
    projection: { key: string; result: WorkspacePortScanResult } | null
  ) => void
  setWorkspacePortScanForKey: (key: string, result: WorkspacePortScanResult | null) => void
  setWorkspacePortScanRefreshing: (refreshing: boolean) => void
  pendingRevealWorktree: PendingSidebarWorktreeReveal | null
  pendingRevealSidebarRow: PendingSidebarRowReveal | null
  revealWorktreeInSidebar: (
    worktreeId: string,
    options?: {
      behavior?: PendingSidebarWorktreeReveal['behavior']
      highlight?: boolean
      beginRename?: boolean
    }
  ) => void
  revealSidebarRow: (
    rowKey: string,
    options?: {
      behavior?: PendingSidebarRowReveal['behavior']
      highlight?: boolean
    }
  ) => void
  clearPendingRevealWorktreeId: () => void
  clearPendingRevealSidebarRow: () => void
  // Why: lets the SourceControl sidebar request that the diff editor scroll
  // to a specific note. Cleared by the diff decorator after it reveals the
  // line, so the same id can be requested again later without the surface
  // seeing a stale value.
  scrollToDiffCommentId: string | null
  setScrollToDiffCommentId: (id: string | null) => void
  persistedUIReady: boolean
  uiZoomLevel: number
  setUIZoomLevel: (level: number) => void
  editorFontZoomLevel: number
  setEditorFontZoomLevel: (level: number) => void
  hydratePersistedUI: (ui: PersistedUIState, source?: 'startup' | 'sync') => void
  updateStatus: UpdateStatus
  setUpdateStatus: (status: UpdateStatus) => void
  // Why: cached changelog from the last 'available' status so the card still has
  // rich content (title/media/description) during downloading, error, and downloaded
  // states. Cleared on idle/checking/not-available to prevent stale leakage.
  updateChangelog: ChangelogData | null
  // Why: UpdateCard is lazy-loaded, so it may miss the transient
  // checking/userInitiated status. Keep manual-check intent in the store until
  // the resulting available/error/not-available state can consume it.
  updateUserInitiatedCycle: boolean
  dismissedUpdateVersion: string | null
  dismissUpdate: (versionOverride?: string) => void
  clearDismissedUpdateVersion: () => void
  // Why: ephemeral and renderer-only — never persisted and never crosses IPC.
  // Resets every session and on every phase transition (see setUpdateStatus).
  updateCardCollapsed: boolean
  setUpdateCardCollapsed: (collapsed: boolean) => void
  updateReassuranceSeen: boolean
  markUpdateReassuranceSeen: () => void
  isFullScreen: boolean
  setIsFullScreen: (v: boolean) => void
  /** URL opened when a new browser tab is created. Null = blank tab (default). */
  browserDefaultUrl: string | null
  setBrowserDefaultUrl: (url: string | null) => void
  browserDefaultSearchEngine: 'google' | 'duckduckgo' | 'bing' | 'kagi' | null
  setBrowserDefaultSearchEngine: (engine: 'google' | 'duckduckgo' | 'bing' | 'kagi' | null) => void
  browserDefaultZoomLevel: number
  setBrowserDefaultZoomLevel: (level: number) => void
  browserKagiSessionLink: string | null
  setBrowserKagiSessionLink: (link: string | null) => void
}
