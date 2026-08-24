import type { TuiAgent } from './settings-foundation-types'

export type TabGroupSplitDirection = 'horizontal' | 'vertical'

export type TabGroupLayoutNode =
  | { type: 'leaf'; groupId: string }
  | {
      type: 'split'
      direction: TabGroupSplitDirection
      first: TabGroupLayoutNode
      second: TabGroupLayoutNode
      /** Flex ratio of the first child (0–1). Defaults to 0.5 if absent. */
      ratio?: number
    }

// ─── Unified Tab ────────────────────────────────────────────────────
export type WorkspacePanelTabContentType =
  | 'explorer'
  | 'vault'
  | 'workspaces'
  | 'pr-checks'
  | 'source-control'
  | 'ports'

export type GitGraphTabContentType = 'git-graph'

export type TabContentType =
  | 'terminal'
  | 'editor'
  | 'diff'
  | 'conflict-review'
  | 'check-details'
  | 'browser'
  | 'simulator'
  | GitGraphTabContentType

export type WorkspaceVisibleTabType = 'terminal' | 'editor' | 'browser' | 'simulator'
export type CtrlTabOrderMode = 'mru' | 'sequential'

export type Tab = {
  id: string // UUID for terminals, filePath for editors (preserves current convention)
  entityId: string // ID of the backing content (terminal tab ID, file path, browser workspace ID)
  groupId: string
  worktreeId: string
  contentType: TabContentType
  label: string // display title (auto-derived from PTY or filename)
  generatedLabel?: string | null
  quickCommandLabel?: string | null
  customLabel: string | null
  color: string | null
  sortOrder: number
  createdAt: number
  isPreview?: boolean // preview tabs get replaced by next single-click open
  isPinned?: boolean // pinned tabs survive "close others"
}

export type TabGroup = {
  id: string
  worktreeId: string
  activeTabId: string | null
  tabOrder: string[] // canonical visual order of tab IDs
  /** Per-group MRU stack (oldest → most-recent at the tail). Drives which tab
   *  becomes active when the current active tab closes: we pop back to the
   *  previously-active tab instead of jumping to a visual neighbor. Scoped to
   *  the group so split panes keep independent histories. Optional because
   *  sessions persisted before this field was added still hydrate cleanly —
   *  hydration seeds from activeTabId. */
  recentTabIds?: string[]
}

// ─── Terminal Tab (legacy — used by persistence and TerminalContentSlice) ─
export type TerminalTab = {
  id: string
  /** Why: runtime handles expire with the app, so persistence stores the owner-assigned id. */
  ptyId: string | null
  worktreeId: string
  /** Spawn-time workspace identity; absent legacy bindings are never safe for remote sharing. */
  worktreeInstanceId?: string
  title: string
  /** Stable fallback label for default-named terminals ("Terminal 1", etc.).
   *  Why: agent CLIs overwrite the live title via OSC updates, but Yiru still
   *  needs the original terminal label for numbering and reset behavior. */
  defaultTitle?: string
  /** Stable opt-in label derived from the first known agent prompt. */
  generatedTitle?: string | null
  /** Stable label from the tab-bar Quick Command that created this terminal. */
  quickCommandLabel?: string | null
  customTitle: string | null
  color: string | null
  /** Pinned tabs survive "close others"; host-persisted for runtime hosts. */
  isPinned?: boolean
  sortOrder: number
  createdAt: number
  /** Bumped on shutdown so TerminalPane remounts with a fresh PTY. */
  generation?: number
  /** Why: records the shell this tab was opened with (e.g. 'wsl.exe') so the
   *  PTY and tab icon stay stable even if the default shell setting changes
   *  later. Older persisted tabs may omit this field. */
  shellOverride?: string
  /** Why: explorer-created terminals can start below the workspace root while
   *  still belonging to that workspace for tab/session ownership. */
  startupCwd?: string
  /** Why: the coding-harness agent Yiru launched in this tab. Lets the tab bar
   *  show the provider icon immediately, before the agent emits its first hook
   *  event (a freshly-launched, idle agent reports no live status yet). Live
   *  hook status overrides this once the agent does anything. Plain terminals
   *  and manually-started agents omit it. */
  launchAgent?: TuiAgent
  /** Why: when `setActiveWorktree` bumps generation on all-dead tabs to drive a
   *  TerminalPane remount, the fresh PTY that results is caused by navigation,
   *  not by the user doing work. Without this flag the resulting
   *  `updateTabPtyId` call would call `bumpWorktreeActivity` and flip the
   *  sidebar's recency sort on every click — the reorder-on-click bug. The
   *  flag is set by `setActiveWorktree` and consumed by the activation-driven
   *  PTY lifecycle calls that follow, which then suppress activity bumps and
   *  `sortEpoch` increments. Split layouts use a numeric count because one tab
   *  can remount several panes. Never persisted — it is a transient handoff. */
  pendingActivationSpawn?: boolean | number
}

export type BrowserHistoryEntry = {
  url: string
  normalizedUrl: string
  title: string
  lastVisitedAt: number
  visitCount: number
}

export type BrowserLoadError = {
  code: number
  description: string
  validatedUrl: string
}

export type BrowserCertificateFailure = {
  challengeId: string
  browserPageId: string
  errorCode: number | null
  error: string
  origin: string
  displayHost: string
  canProceed: boolean
  observedAt: number
}

export type BrowserCertificateProceedFailureReason =
  | 'expired'
  | 'changed'
  | 'ineligible'
  | 'missing'
  | 'navigated'

export type BrowserCertificateProceedResult =
  | { ok: true }
  | { ok: false; reason: BrowserCertificateProceedFailureReason }

// Why: BrowserPage persists the active viewport preset so CDP emulation can be
// reapplied on reload/navigation without the user re-picking from the toolbar.
export type BrowserViewportPresetId =
  | 'mobile-s'
  | 'mobile-m'
  | 'mobile-l'
  | 'tablet'
  | 'laptop'
  | 'laptop-l'
  | 'desktop'

export type BrowserViewportOverride = {
  width: number
  height: number
  deviceScaleFactor: number
  mobile: boolean
}

export type BrowserPage = {
  id: string
  workspaceId: string
  worktreeId: string
  url: string
  title: string
  loading: boolean
  faviconUrl: string | null
  canGoBack: boolean
  canGoForward: boolean
  loadError: BrowserLoadError | null
  createdAt: number
  // Why: remote-owned worktrees can still host client-local fallback browser
  // pages until headless remote runtimes support real browser panes.
  browserRuntimeEnvironmentId?: string | null
  /** Active CDP viewport emulation preset. null = default (fill pane, no CDP override) */
  viewportPresetId?: BrowserViewportPresetId | null
}

export type BrowserWorkspace = {
  id: string
  worktreeId: string
  /** Stable display label for the outer Yiru tab ("Browser 1", "Browser 2", …).
   *  Optional so sessions persisted before this field was added fall back
   *  gracefully to the URL-derived label in getBrowserTabLabel. */
  label?: string
  // Why: each browser workspace binds to exactly one session profile at creation
  // time. The profile determines which Electron partition (and thus which
  // cookies/storage) the guest webview uses. Absent means the legacy shared
  // partition, which keeps backward compat with workspaces persisted before
  // session profiles existed.
  sessionProfileId?: string | null
  // Why: runtime-created tabs resolve profile partition in main. Persisting it
  // keeps isolated storage stable when the renderer profile mirror is stale.
  sessionPartition?: string | null
  activePageId?: string | null
  pageIds?: string[]
  // Why: the active page owns real browser chrome state now, but the top-level
  // Yiru tab strip still renders one workspace entry. Mirror the active page's
  // title/url/loading metadata here so existing workspace-level UI can stay
  // stable while Phase 2 introduces nested browser pages.
  url: string
  title: string
  loading: boolean
  faviconUrl: string | null
  canGoBack: boolean
  canGoForward: boolean
  loadError: BrowserLoadError | null
  createdAt: number
}

export type BrowserTab = BrowserWorkspace

export type BrowserSessionProfileScope = 'default' | 'isolated' | 'imported'

export type BrowserSessionProfileSource = {
  browserFamily:
    | 'chrome'
    | 'chromium'
    | 'arc'
    | 'edge'
    | 'firefox'
    | 'safari'
    | 'comet'
    | 'helium'
    | 'manual'
  profileName?: string
  importedAt: number
}

export type BrowserSessionProfile = {
  id: string
  scope: BrowserSessionProfileScope
  partition: string
  label: string
  source: BrowserSessionProfileSource | null
}

export type BrowserCookieImportSummary = {
  totalCookies: number
  importedCookies: number
  skippedCookies: number
  domains: string[]
}

export type BrowserCookieImportResult =
  | { ok: true; profileId: string; summary: BrowserCookieImportSummary }
  | { ok: false; reason: string }
