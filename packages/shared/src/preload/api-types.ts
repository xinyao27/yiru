import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import type { SleepingAgentLaunchConfig } from '@yiru/workbench-model/agent'
/* eslint-disable max-lines -- Why: the preload contract is intentionally centralized in one declaration file so renderer and preload stay in lockstep when IPC surfaces change. */
import type { HostedReviewProvider } from '@yiru/workbench-model/review'

import type { AppIdentity } from '../app-identity'
import type { StartupCommandDelivery } from '../codex-startup-delivery'
import type {
  CommitMessageAgentCapability,
  CommitMessageModelCapability
} from '../commit-message/agent-spec'
import type {
  CrashReportBreadcrumbData,
  CrashReportCopyDiagnosticsArgs,
  CrashReportRecord,
  CrashReportSubmitArgs,
  CrashReportSubmitResult,
  ReactErrorBoundaryReportArgs,
  ReactErrorBoundaryReportResult
} from '../crash-reporting'
import type { FeatureInteractionId } from '../feature-interactions'
import type { FridaySession } from '../friday-types'
import type { GitHistoryOptions, GitHistoryResult } from '../git/history'
import type {
  GitAddTagResult,
  GitCheckoutCommitResult,
  GitCherryPickResult,
  GitCreateBranchResult,
  GitDropCommitResult,
  GitMergeCommitResult,
  GitRebaseOntoCommitResult,
  GitResetToCommitResult,
  GitRevertResult
} from '../git/write-op-results'
import type {
  LocalhostWorktreeLabelResult,
  LocalhostWorktreeLabelRoute
} from '../localhost-worktree-labels'
import type { ProjectExecutionRuntimeResolution } from '../project-execution-runtime'
import type { PtyMainDeliveryDiagnostics } from '../pty-delivery-diagnostics'
import type { PtyModelRestoreNeededEvent } from '../pty-model-restore-marker'
import type {
  PtyRendererDeliveryHealthReply,
  PtyRendererDeliveryStateReport
} from '../pty-renderer-delivery-health'
import type { PublicKnownRuntimeEnvironment } from '../runtime-environments'
import type { RuntimeStatus } from '../runtime-types'
import type { ResolvedSourceControlAiGenerationParams } from '../source-control/ai'
import type { SourceControlAiSettings } from '../source-control/ai-types'
import type { TerminalSideEffectBatch } from '../terminal/side-effect-facts'
import type { TerminalViewAttributes } from '../terminal/view-attributes'
import type {
  BrowserSessionProfileSource,
  ClaudeRateLimitAccountsState,
  CodexRateLimitAccountsState,
  CustomPet,
  GitBranchCompareResult,
  GitCommitCompareResult,
  GitConflictOperation,
  GitDiffResult,
  GitForkSyncExpectedUpstream,
  GitForkSyncResult,
  GitPushTarget,
  GitStagingArea,
  GitStatusResult,
  GitUpstreamStatus,
  FloatingTerminalCwdRequest,
  MarkdownDocument,
  PathSource,
  PersistedUIState,
  ShellHydrationFailureReason,
  StatsSummary,
  TuiAgent
} from '../types'

export type {
  ShellOpenExternalEditorRequest,
  ShellOpenExternalEditorResult,
  ShellOpenLocalPathResult
} from '../shell-open-types'

type RuntimeEnvironmentSubscriptionHandle = {
  unsubscribe: () => void
  sendBinary: (bytes: Uint8Array<ArrayBufferLike>) => void
}
import type {
  AiVaultListArgs,
  AiVaultListResult,
  AiVaultSubagentListArgs,
  AiVaultSubagentListResult
} from '@yiru/workbench-model/agent'

import type {
  AutomationDispatchResult,
  AutomationPrecheckResult,
  AutomationRun
} from '../automations-types'
import type {
  ClaudeUsageBreakdownKind,
  ClaudeUsageBreakdownRow,
  ClaudeUsageDailyPoint,
  ClaudeUsageRange,
  ClaudeUsageScanState,
  ClaudeUsageScope,
  ClaudeUsageSessionRow,
  ClaudeUsageSnapshot,
  ClaudeUsageSummary
} from '../claude-usage-types'
import type {
  CodexUsageBreakdownKind,
  CodexUsageBreakdownRow,
  CodexUsageDailyPoint,
  CodexUsageRange,
  CodexUsageScanState,
  CodexUsageScope,
  CodexUsageSessionRow,
  CodexUsageSnapshot,
  CodexUsageSummary
} from '../codex-usage-types'
import type {
  DeveloperPermissionId,
  DeveloperPermissionRequestResult,
  DeveloperPermissionState
} from '../developer-permissions-types'
import type {
  OpenCodeUsageBreakdownKind,
  OpenCodeUsageBreakdownRow,
  OpenCodeUsageDailyPoint,
  OpenCodeUsageRange,
  OpenCodeUsageScanState,
  OpenCodeUsageScope,
  OpenCodeUsageSessionRow,
  OpenCodeUsageSnapshot,
  OpenCodeUsageSummary
} from '../opencode-usage-types'
import type { TelemetryConsentState } from '../telemetry-consent-types'
import type { AgentKind, LaunchSource, RequestKind } from '../telemetry-events'

export type EmulatorApi = {
  // Why: startFrameStream/stopFrameStream (+ onFrameStreamFrame/
  // onFrameStreamError below) and startVideoStream/stopVideoStream (+
  // onVideoStreamMeta/onVideoStreamFrame below) are the MJPEG/H.264 binary
  // frame side-channel for the mobile emulator screen — deliberately kept off
  // the `emulator.*` oRPC contract (see the matching `Why:` on
  // `emulatorContract` in packages/runtime-protocol/src/contract/emulator.ts
  // and `emulatorRuntimeHandlers` in main/runtime/rpc/orpc/router-direct/
  // emulator.ts). An event-iterator procedure has no channel for raw bytes
  // outside its JSON envelope; carrying frame data through one would mean
  // base64-encoding every frame. This is a documented, repeatedly-judged
  // holdout (docs/runtime-orpc-migration.md Phase 3 "明确豁免" / §1.5), not an
  // unstarted migration — a real fix needs its own binary side-channel
  // design, not a Phase 4/5 call-site move.
  startFrameStream: (args: { streamUrl: string; streamKey?: string }) => Promise<{
    streamId: string
  }>
  stopFrameStream: (args: { streamId: string }) => Promise<void>
  onFrameStreamFrame: (
    callback: (data: { streamId: string; bytes: ArrayBuffer }) => void
  ) => () => void
  onFrameStreamError: (
    callback: (data: { streamId: string; message: string }) => void
  ) => () => void
  startVideoStream: (args: { deviceId: string; streamId: string }) => Promise<{ streamId: string }>
  stopVideoStream: (args: { streamId: string }) => Promise<void>
  onVideoStreamMeta: (
    callback: (data: {
      streamId: string
      deviceId: string
      meta: { codecId: string; width: number; height: number }
    }) => void
  ) => () => void
  onVideoStreamFrame: (
    callback: (data: {
      streamId: string
      deviceId: string
      config: boolean
      keyFrame: boolean
      bytes: ArrayBuffer
    }) => void
  ) => () => void
}

export type DetectedBrowserProfileInfo = {
  name: string
  directory: string
}

export type DetectedBrowserInfo = {
  family: BrowserSessionProfileSource['browserFamily']
  label: string
  profiles: DetectedBrowserProfileInfo[]
  selectedProfile: string
}

export type PreflightStatus = {
  git: { installed: boolean }
  gh: { installed: boolean; authenticated: boolean }
  /** Optional — older preload payloads predating GitLab support don't
   *  include it. Consumers gate on `glab?.installed` / `authenticated`. */
  glab?: { installed: boolean; authenticated: boolean }
  bitbucket?: { configured: boolean; authenticated: boolean; account: string | null }
  azureDevOps?: {
    configured: boolean
    authenticated: boolean
    account: string | null
    baseUrl: string | null
    tokenConfigured: boolean
  }
  gitea?: {
    configured: boolean
    authenticated: boolean
    account: string | null
    baseUrl: string | null
    tokenConfigured: boolean
  }
}

export type RefreshAgentsResult = {
  agents: string[]
  addedPathSegments: string[]
  shellHydrationOk: boolean
  /** Why: drives the agent_picks `on_path:false` triage in dashboard 1562016
   *  (insight A). `'shell_hydrate'` = detection saw the user's full shell PATH;
   *  `'sync_seed_only'` = hydration failed and detection ran against the
   *  seed list from `patchPackagedProcessPath`. */
  pathSource: PathSource
  /** Why: classified hydration outcome. `'none'` on success; one of the failure
   *  modes when `shellHydrationOk` is false. Typed off the shared alias so
   *  schema/main/preload/renderer stay in lockstep. */
  pathFailureReason: ShellHydrationFailureReason
}

export type PreflightRuntimeContext = {
  wslDistro?: string | null
  wslDefault?: boolean
  projectRuntime?: ProjectExecutionRuntimeResolution
}

// Why: renderer-facing mirror of the daemon's `SessionInfo` + protocolVersion
// annotation (src/main/daemon/types.ts `DaemonSessionInfo`). Kept here instead
// of imported from main because the preload boundary must not depend on
// main-only protocol types — those are subprocess-facing. Keep the two shapes
// in sync when adding fields on either side; the Manage Sessions panel reads
// these directly.
export type ExportApi = {
  htmlToPdf: (args: {
    html: string
    title: string
  }) => Promise<
    { success: true; filePath: string } | { success: false; cancelled?: boolean; error?: string }
  >
}

export type StatsApi = {
  getSummary: (args?: { refreshUsage?: boolean }) => Promise<StatsSummary>
}

// Diagnostics — error-tracking-lane payload shapes that cross the IPC
// boundary. Mirror the runtime types in
// `src/main/observability/{index,bundle}.ts`. Kept here, not imported,
// because the preload api-types file is the source of truth for the
// renderer's view of the IPC surface.
export type DiagnosticsStatusPayload = {
  readonly localFileEnabled: boolean
  readonly bundleEnabled: boolean
  readonly traceFilePath: string
  readonly traceFamilySize: number
  readonly disabledReason?:
    | 'do_not_track'
    | 'yiru_telemetry_disabled'
    | 'yiru_diagnostics_disabled'
    | 'ci'
}
export type DiagnosticsBundlePayload = {
  readonly bundleSubmissionId: string
  readonly bytes: number
  readonly spanCount: number
}
export type DiagnosticsUploadPayload =
  | {
      readonly ticketId: string
    }
  | {
      readonly canceled: true
    }

// Why: shell-only, but not for the `platform`/`settings` "local store" reason
// above — this feature never had a host-routing concept to begin with.
// `ClaudeUsageStore` (main/claude/usage/store.ts) unconditionally scans
// `homedir()/.claude/projects` on the machine running Yiru's own Electron
// main process and correlates it against that same process's local
// `store.getRepos()`; there is no `target`/host parameter anywhere in the
// store, the scanner, or these IPC handlers, unlike `git`/`diagnostics.memory`
// which branch on `target.kind`. A Claude Code session running on a paired
// SSH/relay host writes its transcripts on *that* host, so this dashboard
// already cannot see remote sessions today — routing it through the runtime
// contract would mean inventing per-host transcript scanning from scratch,
// not moving a channel; a real capability gap, but a feature-scoped one, not
// this migration's. Also not the same shape as `contract/provider-usage.ts`'s
// `usage.cursor`: that is rate-limit state (`ProviderRateLimits`, mirrors
// `rateLimits` below), this is local token/cost/session-history analytics —
// same "usage" word, unrelated capability. `codexUsage`/`openCodeUsage` below
// are the identical pattern (`~/.codex` / opencode's local app-data dir
// instead of `~/.claude`), judged together.
export type ClaudeUsageApi = {
  getScanState: () => Promise<ClaudeUsageScanState>
  setEnabled: (args: { enabled: boolean }) => Promise<ClaudeUsageScanState>
  refresh: (args?: { force?: boolean }) => Promise<ClaudeUsageScanState>
  getSnapshot: (args: {
    scope: ClaudeUsageScope
    range: ClaudeUsageRange
    limit?: number
  }) => Promise<ClaudeUsageSnapshot>
  getSummary: (args: {
    scope: ClaudeUsageScope
    range: ClaudeUsageRange
  }) => Promise<ClaudeUsageSummary>
  getDaily: (args: {
    scope: ClaudeUsageScope
    range: ClaudeUsageRange
  }) => Promise<ClaudeUsageDailyPoint[]>
  getBreakdown: (args: {
    scope: ClaudeUsageScope
    range: ClaudeUsageRange
    kind: ClaudeUsageBreakdownKind
  }) => Promise<ClaudeUsageBreakdownRow[]>
  getRecentSessions: (args: {
    scope: ClaudeUsageScope
    range: ClaudeUsageRange
    limit?: number
  }) => Promise<ClaudeUsageSessionRow[]>
}

// Why: shell-only, same reasoning as `ClaudeUsageApi` above — `CodexUsageStore`
// scans `getSystemCodexHomePath()`/`getYiruManagedCodexHomePath()` (both under
// `homedir()`/Electron's local `userData`) on the machine running the main
// process, with no host/target parameter anywhere in the chain.
export type CodexUsageApi = {
  getScanState: () => Promise<CodexUsageScanState>
  setEnabled: (args: { enabled: boolean }) => Promise<CodexUsageScanState>
  refresh: (args?: { force?: boolean }) => Promise<CodexUsageScanState>
  getSnapshot: (args: {
    scope: CodexUsageScope
    range: CodexUsageRange
    limit?: number
  }) => Promise<CodexUsageSnapshot>
  getSummary: (args: {
    scope: CodexUsageScope
    range: CodexUsageRange
  }) => Promise<CodexUsageSummary>
  getDaily: (args: {
    scope: CodexUsageScope
    range: CodexUsageRange
  }) => Promise<CodexUsageDailyPoint[]>
  getBreakdown: (args: {
    scope: CodexUsageScope
    range: CodexUsageRange
    kind: CodexUsageBreakdownKind
  }) => Promise<CodexUsageBreakdownRow[]>
  getRecentSessions: (args: {
    scope: CodexUsageScope
    range: CodexUsageRange
    limit?: number
  }) => Promise<CodexUsageSessionRow[]>
}

// Why: shell-only, same reasoning as `ClaudeUsageApi` above — the OpenCode
// scanner reads its local sqlite db under `getXdgDataHome()`/`LOCALAPPDATA`
// (still `homedir()`-derived) on the machine running the main process, again
// with no host/target parameter anywhere in the chain.
export type OpenCodeUsageApi = {
  getScanState: () => Promise<OpenCodeUsageScanState>
  setEnabled: (args: { enabled: boolean }) => Promise<OpenCodeUsageScanState>
  refresh: (args?: { force?: boolean }) => Promise<OpenCodeUsageScanState>
  getSnapshot: (args: {
    scope: OpenCodeUsageScope
    range: OpenCodeUsageRange
    limit?: number
  }) => Promise<OpenCodeUsageSnapshot>
  getSummary: (args: {
    scope: OpenCodeUsageScope
    range: OpenCodeUsageRange
  }) => Promise<OpenCodeUsageSummary>
  getDaily: (args: {
    scope: OpenCodeUsageScope
    range: OpenCodeUsageRange
  }) => Promise<OpenCodeUsageDailyPoint[]>
  getBreakdown: (args: {
    scope: OpenCodeUsageScope
    range: OpenCodeUsageRange
    kind: OpenCodeUsageBreakdownKind
  }) => Promise<OpenCodeUsageBreakdownRow[]>
  getRecentSessions: (args: {
    scope: OpenCodeUsageScope
    range: OpenCodeUsageRange
    limit?: number
  }) => Promise<OpenCodeUsageSessionRow[]>
}

export type AiVaultApi = {
  /** Lists the Task subagent transcripts of one session, on demand. */
  listSessions: (args?: AiVaultListArgs) => Promise<AiVaultListResult>
  listSubagentSessions: (args: AiVaultSubagentListArgs) => Promise<AiVaultSubagentListResult>
  /** Fires when any app window regains OS focus; returns an unsubscribe. */
  // Why: shell-only — fires only from Electron's app-level
  // `browser-window-focus` (main/ai-vault/ai-vault.ts), a workaround for
  // macOS app-activation not raising a DOM focus event. The consumer
  // (workspace-panel/ai-vault/session-refresh.ts) already re-triggers the
  // same forced rescan off `document.visibilitychange`, which fires in a
  // browser tab — a paired web client already gets the equivalent refresh
  // without this channel, so there is nothing to route through runtime.
  onWindowFocused: (callback: () => void) => () => void
}

// Why: shell-only — every member acts on the Electron process itself (its own
// identity/lifecycle, this machine's Dock badge and IME probe, native
// dialogs, and this installation's userData-scoped Floating Workspace
// directory via `app.getPath()`). None takes a host/target parameter and
// none has a runtime-side counterpart to migrate to. The web adapter
// (`renderer/web/preload-api.ts`) independently confirms this — every member
// is a hardcoded local no-op (`Promise.resolve(...)`), never a
// `callRuntimeProcedure` call.
export type AppApi = {
  /** Returns the app identity currently exposed to native chrome and the titlebar. */
  getIdentity: () => Promise<AppIdentity>
  /** Relaunches the app via Electron's app.relaunch() + app.exit(0). Used
   *  by settings panes that need a full restart to apply changes (e.g. the
   *  terminal-window blur setting in TerminalWindowSection). */
  relaunch: () => Promise<void>
  /** Restarts Yiru through the normal quit pipeline so daemon-backed terminal
   *  sessions survive and can reattach after the new process starts. */
  restart: () => Promise<void>
  /** Reloads the current app renderer through main so expected renderer
   *  teardown can be classified before Electron emits process-gone events. */
  reload: () => Promise<void>
  /** Resolves when the daemon PTY provider and hook receiver have either
   *  started or failed open for the first BrowserWindow. */
  // Why: this is the bootstrap gate for the very runtime a contract call would
  // route through, so it cannot be provided by the runtime it is waiting on.
  // `startTerminalRuntimeStartupServices()` runs unconditionally in
  // `main/index.ts` before branching on headless `--serve` vs. a
  // `BrowserWindow`, so the barrier itself is process-startup state, not a
  // window-scoped concept with a host-side twin — only a windowed renderer
  // ever calls this channel to await it.
  awaitFirstWindowStartupServices: () => Promise<void>
  /** Emits a startup benchmark marker when YIRU_STARTUP_DIAGNOSTICS is enabled. */
  startupDiagnostic: (event: string, details?: Record<string, unknown>) => Promise<void>
  /** Returns the macOS active input mode, or layout ID when no IME mode is
   *  selected (e.g. `com.apple.keylayout.PolishPro`). Used by the
   *  keyboard-layout probe to distinguish CJK IMEs and layouts whose base
   *  layer matches US QWERTY but whose Option layer composes characters
   *  (issue #1205).
   *  Returns null on non-Darwin platforms or when the defaults read fails. */
  getKeyboardInputSourceId: () => Promise<string | null>
  /** Updates the macOS Dock unread badge. No-op on Windows/Linux. */
  setUnreadDockBadgeCount: (count: number) => Promise<void>
  /** Resolves the launch directory for global Floating Terminal tabs. */
  getFloatingTerminalCwd: (args?: FloatingTerminalCwdRequest) => Promise<string>
  /** Resolves Yiru's app-owned directory for auto-created Floating Workspace
   *  markdown notes. */
  getFloatingMarkdownDirectory: () => Promise<string>
  /** Opens a native picker for markdown documents, rooted in the floating
   *  workspace, and authorizes the selected file for editor reads/writes. */
  pickFloatingMarkdownDocument: () => Promise<MarkdownDocument | null>
  /** Opens a native directory picker and authorizes the selected directory
   *  for Floating Workspace markdown file creation. */
  pickFloatingWorkspaceDirectory: () => Promise<string | null>
}

export type RepoHostAdapter = {
  // Why: these pickers operate on the machine rendering the UI, not the
  // selected runtime target, so they remain an explicit shell dependency.
  pickFolder: () => Promise<string | null>
  pickFolders: () => Promise<string[]>
  pickDirectory: () => Promise<string | null>
  // Why: these mutate desktop-owned host rows or an Electron-owned in-flight
  // clone. They are adapter state, not repo capability procedures.
  removeForHost: (args: { repoId: string; hostId: string }) => Promise<void>
  reorderForHost: (args: {
    orderedIds: string[]
    hostId: string
  }) => Promise<{ status: 'applied' | 'rejected' }>
  cloneAbort: () => Promise<void>
  // Why: the local renderer cannot derive the Electron host's home directory.
  getDefaultCreateProjectParent: () => Promise<string>
}

export type PreloadApi = {
  // Why: this group's `on*` members (onDeliveryResyncRequest, onData,
  // onReplay, onModelRestoreNeeded, onSideEffect, onExit,
  // onClearBufferRequest) are never a runtime migration gap.
  // `onSerializeBufferRequest`/`sendSerializedBuffer` moved to the
  // shell-services reverse contract (Phase 5 step 4, `pty` group A —
  // contract/shell-services-pty.ts) and no longer live here. Per-keystroke
  // terminal I/O is Appendix A's explicit
  // binary/flow-control exemption (`pty:data`, §1.5's "明确豁免" bucket), and
  // Phase 3's "误报更正 2" found the whole control-plane batch already
  // covered a different way: web panes never call `window.api.pty.*` at all.
  // `terminal-pane/pty/connection.ts` branches on `runtimeEnvironmentId` and
  // always resolves to `createRemoteRuntimePtyTransport`
  // (`remote-runtime-pty-transport.ts`), which rides the runtime's
  // `terminal.subscribe`/`terminal.multiplex` event-iterator streams
  // end-to-end and never touches this preload surface. A paired web client
  // always has an environment id, so it never takes the
  // `createIpcPtyTransport` branch these stubs would otherwise serve.
  pty: {
    spawn: (opts: {
      cols: number
      rows: number
      cwd?: string
      cwdFallback?: 'worktree'
      env?: Record<string, string>
      envToDelete?: string[]
      command?: string
      launchConfig?: SleepingAgentLaunchConfig
      launchToken?: string
      launchAgent?: TuiAgent
      startupCommandDelivery?: StartupCommandDelivery
      connectionId?: string | null
      worktreeId?: string
      sessionId?: string
      // Why: lets a single tab open in a different shell than the user's default.
      // Preserved from the deleted index.d.ts PtyApi duplicate during the
      // single-source-of-truth collapse (see docs/preload-typecheck-hole.md §1).
      shellOverride?: string
      projectRuntime?: ProjectExecutionRuntimeResolution
      terminalColorQueryReplies?: { foreground?: string; background?: string }
      // Why: hidden-at-spawn declaration — main marks the PTY hidden before
      // its first byte so the delivery gate + model responder own spawn-time
      // queries (terminal-query-authority.md §races).
      initiallyHidden?: boolean
      // Why: closes the SIGKILL race documented in INVESTIGATION.md — main
      // sync-flushes the (worktreeId, tabId, leafId → ptyId) binding before
      // pty:spawn returns. Only the renderer's daemon-host path threads these.
      tabId?: string
      leafId?: string
      // Why: telemetry-plan.md§Agent launch semantics — main emits
      // `agent_started` only after the PTY/session is created successfully,
      // so the renderer threads the launch metadata through this field and
      // the IPC handler fires the event from the spawn-success branch.
      telemetry?: { agent_kind: AgentKind; launch_source: LaunchSource; request_kind: RequestKind }
    }) => Promise<{
      id: string
      launchAgent?: TuiAgent
      launchConfig?: SleepingAgentLaunchConfig
      snapshot?: string
      snapshotCols?: number
      snapshotRows?: number
      isReattach?: boolean
      isAlternateScreen?: boolean
      replay?: string
      sessionExpired?: boolean
      coldRestore?: { scrollback: string; cwd: string }
      startupCwdFallback?: { kind: 'worktree'; cwd: string }
    }>
    write: (id: string, data: string) => void
    writeAccepted: (id: string, data: string) => Promise<boolean>
    resize: (id: string, cols: number, rows: number) => void
    claimViewport: (id: string, cols: number, rows: number) => void
    reportGeometry: (id: string, cols: number, rows: number) => void
    signal: (id: string, signal: string) => void
    clearBuffer: (id: string) => void
    kill: (id: string, opts?: { keepHistory?: boolean }) => Promise<void>
    ackColdRestore: (id: string) => void
    ackData: (id: string, charCount: number, processedChars?: number) => void
    onDeliveryResyncRequest: (callback: (payload: { requestId: number }) => void) => () => void
    respondDeliveryResync: (payload: {
      requestId: number
      processedCharsByPty: Record<string, number>
    }) => void
    /** Renderer-initiated delivery health/heal lane over invoke — reaches main
     *  even when every main→renderer push channel is dead (field wedge). */
    reportRendererDeliveryState: (
      report: PtyRendererDeliveryStateReport
    ) => Promise<PtyRendererDeliveryHealthReply>
    /** Live pty:data listener count on the preload emitter (sync) — heal-time
     *  discriminator between a detached listener and a dead channel. */
    getPtyDataListenerCount: () => number
    /** One-shot signal that this page's pty:data dispatcher is registered, so
     *  main can release sends held during the load/reload boot window. */
    rendererDispatcherReady: () => void
    setActiveRendererPty: (id: string, active: boolean) => void
    setRendererPtyVisible: (id: string, visible: boolean) => void
    /** Hidden-delivery gate (Phase 4): hidden=true lets main drop renderer
     *  byte delivery after model ingestion; reveal restores from snapshots. */
    setHiddenRendererPty: (id: string, hidden: boolean) => void
    /** Ref-counted-on-the-renderer delivery-interest signal that suppresses
     *  the hidden-delivery gate while any raw-byte consumer is registered. */
    setPtyDeliveryInterest: (id: string, interested: boolean) => void
    /** View-attribute bridge (Phase 5 slice 2): app-global composed terminal
     *  appearance push backing main's hidden-PTY OSC/DSR color replies. */
    publishTerminalViewAttributes: (attributes: TerminalViewAttributes) => void
    hasChildProcesses: (id: string) => Promise<boolean>
    getForegroundProcess: (id: string) => Promise<string | null>
    confirmForegroundProcess: (id: string) => Promise<string | null>
    getCwd: (id: string) => Promise<string>
    getSize: (id: string) => Promise<{ cols: number; rows: number } | null>
    listSessions: () => Promise<{ id: string; cwd: string; title: string }[]>
    getAuthoritativeBufferSnapshotCapabilities?: (
      ids: string[]
    ) => { id: string; authoritative: boolean | null }[]
    hasPty: (id: string) => Promise<boolean | null>
    getMainBufferSnapshot: (
      id: string,
      opts?: { scrollbackRows?: number }
    ) => Promise<{
      data: string
      cols: number
      rows: number
      cwd?: string | null
      seq?: number
      /** Start of main's pending renderer-delivery queue at snapshot time
       *  (equals `seq` when empty) — bounds the renderer's post-restore
       *  duplicate window. */
      pendingDeliveryStartSeq?: number
      source?: 'headless' | 'renderer'
      alternateScreen?: boolean
      /** Authoritative normal buffer paired with an alternate-screen frame. */
      scrollbackAnsi?: string
      /** Trailing incomplete escape the emulator ingested; the restorer must
       *  write it after its post-replay resets, last before live chunks. */
      pendingEscapeTailAnsi?: string
    } | null>
    getRendererDeliveryDebugSnapshot: () => Promise<{
      pendingPtyCount: number
      pendingChars: number
      maxPendingCharsByPty: number
      rendererInFlightPtyCount: number
      rendererInFlightChars: number
      maxRendererInFlightCharsByPty: number
      activeRendererPtyCount: number
      flushScheduled: boolean
      peakPendingChars: number
      peakMaxPendingCharsByPty: number
      peakRendererInFlightChars: number
      peakMaxRendererInFlightCharsByPty: number
      ackGatedFlushSkipCount: number
      hiddenDeliveryGatedPtyCount: number
      hiddenDeliveryGatedVisiblePtyCount: number
      hiddenDeliveryGatedActivePtyCount: number
      deliveryInterestPtyCount: number
      hiddenDeliveryDroppedChars: number
      hiddenDeliveryDroppedChunks: number
      pendingDroppedChars: number
      diagnostics: PtyMainDeliveryDiagnostics
      rendererLifecycleResetCount: number
      lastLifecycleResetClearedChars: number
      rendererPtyDispatcherReady: boolean
      rendererDispatcherReadyForcedCount: number
    }>
    onData: (
      callback: (data: {
        id: string
        data: string
        seq?: number
        rawLength?: number
        background?: boolean
        droppedOutput?: boolean
      }) => void
    ) => () => void
    onReplay: (callback: (data: { id: string; data: string }) => void) => () => void
    /** Out-of-band main→renderer signal that renderer-bound bytes were
     *  dropped (hidden-delivery gate / pending cap); the pane restores from
     *  the model snapshot. Never delivered in-band on pty:data. */
    onModelRestoreNeeded: (callback: (event: PtyModelRestoreNeededEvent) => void) => () => void
    /** Batched derived side-effect facts for PTYs whose bytes transit local
     *  main; see docs/reference/terminal-side-effect-authority.md. */
    onSideEffect: (callback: (batch: TerminalSideEffectBatch) => void) => () => void
    /** Title-only replay snapshot for (re)attach; attention facts never replay. */
    getSideEffectSnapshot: (id: string) => Promise<TerminalSideEffectBatch | null>
    onExit: (callback: (data: { id: string; code: number }) => void) => () => void
    onClearBufferRequest: (callback: (data: { ptyId: string }) => void) => () => void
    declarePendingPaneSerializer: (paneKey: string) => Promise<number>
    settlePaneSerializer: (paneKey: string, gen: number) => Promise<void>
    clearPendingPaneSerializer: (paneKey: string, gen: number) => Promise<void>
    reportRendererSerializerReady?: (ptyId: string) => Promise<void>
  }
  // Why: shell-only — posts telemetry about this app instance straight to
  // the support backend over HTTP from the main process; there is no
  // runtime host in the loop to route through.
  feedback: {
    submit: (args: {
      feedback: string
      submitAnonymously?: boolean
      githubLogin: string | null
      githubEmail: string | null
    }) => Promise<{ ok: true } | { ok: false; status: number | null; error: string }>
  }
  // Why: shell-only — every member reports on or reads back crashes/errors of
  // *this* Electron process (main + renderer), backed by a local
  // CrashReportStore and Electron's own `clipboard`/`app.getVersion()`. A
  // crash belongs to whichever process crashed, which is always this shell,
  // never a runtime host.
  crashReports: {
    getLatestPending: () => Promise<CrashReportRecord | null>
    getLatestReport: () => Promise<CrashReportRecord | null>
    dismiss: (args: { reportId: string }) => Promise<CrashReportRecord | null>
    recordRendererError: (
      args: ReactErrorBoundaryReportArgs
    ) => Promise<ReactErrorBoundaryReportResult>
    recordBreadcrumb: (args: { name: string; data?: CrashReportBreadcrumbData }) => void
    submit: (args: CrashReportSubmitArgs) => Promise<CrashReportSubmitResult>
    copyLatestDiagnostics: (
      args?: CrashReportCopyDiagnosticsArgs
    ) => Promise<{ ok: true } | { ok: false; error: string }>
  }
  // Why: shell-only — `htmlToPdf` opens a hidden Electron `BrowserWindow` and
  // calls its own `webContents.printToPDF()` (main/export/html-to-pdf.ts),
  // then shows a native `dialog.showSaveDialog` on the window that asked and
  // writes the PDF to the chosen local path (main/export/export.ts). Every
  // step is an API of the machine rendering this window; there is no
  // host/target parameter anywhere in the chain and no runtime-host
  // equivalent of "print this window's content to a local PDF file."
  export: ExportApi
  // Why: shell-only, and the four `telemetry*` members below are one judgment
  // — consent and event emission are properties of *this installation*, not of
  // any runtime host. Routing them through the runtime contract would mean
  // asking a remote machine about this machine's consent. The PostHog client
  // and the opt-in store are main-side (gated on IS_OFFICIAL_BUILD plus the
  // build-identity/write-key pair), the effective-consent reason includes env
  // vars the renderer cannot read, and the per-session consent-mutation rate
  // limit is enforced in main. Same reasoning as the `diagnostics` group below,
  // which is the same pipeline's file/bundle half. These four were the group
  // the Phase 4/5 acceptance audit found had never been judged anywhere — the
  // code was already right; only the judgment was missing, and it was missing
  // because a `name: {` group count skips bare function members like these.
  /** Fire-and-forget track. Loose typing at the IPC boundary on purpose —
   *  the main-side validator is the single enforcement point. Renderer call
   *  sites should import `track<N>()` from `packages/client/src/lib/telemetry.ts`
   *  for the `EventMap`-based type safety, not reach for this directly. */
  telemetryTrack: (name: string, props: Record<string, unknown>) => Promise<void>
  // Why: shell-only — see the `telemetry*` group judgment above.
  /** Flip the persisted opt-in preference. Subject to a per-session
   *  consent-mutation rate limit on the main side (≤5/session). */
  telemetrySetOptIn: (optedIn: boolean) => Promise<void>
  /** Diagnostic file controls. Surface for telemetry-error-tracking.md
   *  §User controls. The renderer triggers flows; main does the filesystem /
   *  network work and returns serializable metadata. Main retains collected
   *  upload payloads so the renderer can confirm without reading or
   *  substituting arbitrary bytes.
   *  Why: shell-only — despite the name, this is unrelated to the contract's
   *  `diagnostics.memory` (host CPU/memory snapshot). It is *this Electron
   *  installation's* trace-file/crash-bundle telemetry pipeline, uploaded to
   *  PostHog; the web adapter hardcodes it disabled and rejects the
   *  collect/open/upload actions with "unavailable on web" — a deliberate
   *  non-goal, not a gap. Same-named groups, unrelated concepts. */
  diagnostics: {
    getStatus: () => Promise<DiagnosticsStatusPayload>
    collectBundle: (lookbackMinutes?: number) => Promise<DiagnosticsBundlePayload>
    openBundlePreview: (bundleSubmissionId: string) => Promise<void>
    discardBundlePreview: (bundleSubmissionId: string) => Promise<void>
    uploadBundle: (bundleSubmissionId: string) => Promise<DiagnosticsUploadPayload>
  }
  // Why: shell-only — see the `telemetry*` group judgment above. The env-var
  // half of the reason is main-side state a renderer cannot read at all, so
  // there is no host-routable version of this answer.
  /** Read-only view of effective consent state, including the reason if
   *  disabled (env var / user opt-out / CI / pending banner). Used by the
   *  Privacy pane to render the correct "blocked by X" helper text — env
   *  vars are main-side state the renderer cannot read directly. */
  telemetryGetConsentState: () => Promise<TelemetryConsentState>
  // Why: shell-only — same judgment as the `telemetry*` block above (the
  // `diagnostics` group sits between them, so this repeats the tag rather than
  // relying on comment proximity).
  /** Banner ✕ — persist `optedIn = true` silently, emit nothing. Deliberately
   *  a separate channel from `telemetrySetOptIn` because main's `via`
   *  derivation on that channel would tag this path as `first_launch_banner`
   *  and fire `telemetry_opted_in`, which the ✕-as-silent-acknowledge
   *  semantics forbid (the user did not explicitly opt in, they declined to
   *  intervene). Subject to the same per-session consent-mutation rate
   *  limit as `telemetrySetOptIn`. */
  telemetryAcknowledgeBanner: () => Promise<void>
  // Why: shell-only — `register` spins up a loopback-proxy route on the
  // machine that will open the link, gated to `sourceOwner.kind === 'local'`
  // call sites only. It never fires for an environment-hosted workspace.
  localhostWorktreeLabels: {
    register: (args: LocalhostWorktreeLabelRoute) => Promise<LocalhostWorktreeLabelResult>
  }
  // Why: select/remove moved to the runtime contract (`accounts.selectCodex` /
  // `accounts.removeCodex`) — see provider-accounts-client.ts. add/reauthenticate
  // stay here because they spawn `codex login` PTYs that need a desktop browser.
  // `list` stays too: it is a plain, non-blocking read of `CodexAccountService`'s
  // own cache with no equivalent on the contract — `accounts.list` looks
  // same-shaped but is a different call, not a duplicate route to this one: it
  // forces `runtime.refreshAccountsForMobile()` before returning and can hang
  // for minutes behind broken provider auth (see the `Why:` on
  // `watchProviderAccounts` in provider-accounts-client.ts, which deliberately
  // avoids it for the local target for exactly that reason).
  codexAccounts: {
    list: () => Promise<CodexRateLimitAccountsState>
    add: (args?: {
      runtime?: 'host' | 'wsl'
      wslDistro?: string | null
    }) => Promise<CodexRateLimitAccountsState>
    reauthenticate: (args: { accountId: string }) => Promise<CodexRateLimitAccountsState>
  }
  // Why: select/remove moved to the runtime contract (`accounts.selectClaude` /
  // `accounts.removeClaude`) — see provider-accounts-client.ts. add/reauthenticate/
  // cancelPendingLogin stay here because they spawn `claude login` PTYs that need
  // a desktop browser. `list` stays too, same reason as `codexAccounts.list`
  // above: `accounts.list` is not a duplicate route to it, it forces a
  // provider-usage refresh first and can hang behind broken auth, which is why
  // `watchProviderAccounts` (provider-accounts-client.ts) reads this IPC member
  // for the local target instead of the contract call of the same-shaped name.
  claudeAccounts: {
    list: () => Promise<ClaudeRateLimitAccountsState>
    add: (args?: {
      runtime?: 'host' | 'wsl'
      wslDistro?: string | null
    }) => Promise<ClaudeRateLimitAccountsState>
    cancelPendingLogin: () => Promise<boolean>
    reauthenticate: (args: { accountId: string }) => Promise<ClaudeRateLimitAccountsState>
  }
  // Why: shell-only — pre-writes the same trust-marker files cursor-agent/
  // Copilot CLI/Codex write into this machine's homedir() config
  // (~/.cursor, ~/.copilot, ~/.codex) ahead of a locally-spawned PTY, so the
  // first-run "trust this folder?" TUI prompt never intercepts a pasted
  // draft.
  agentTrust: {
    markTrusted: (args: {
      preset: 'cursor' | 'copilot' | 'codex'
      workspacePath: string
    }) => Promise<void>
  }
  // Why: shell-only — every check here (systemPreferences, osascript Apple
  // Events probe, a UDP bind for the local-network prompt) targets the OS
  // permission state of the Electron shell bundle running on this machine.
  // Not the same domain as `computer.permissions*`: that pair only covers
  // the Computer Use sidecar's accessibility/screenshot access on the
  // targeted runtime host (2 ids); this covers this app's own mic/camera/
  // screen/accessibility/full-disk-access/automation/local-network/usb/
  // bluetooth TCC status (9 ids). Same field name (`id`), disjoint domains.
  // `openSettings` was dropped as dead code (zero callers, confirmed by
  // typecheck) — `request` already falls back to the same privacy pane.
  developerPermissions: {
    getStatus: () => Promise<DeveloperPermissionState[]>
    request: (args: { id: DeveloperPermissionId }) => Promise<DeveloperPermissionRequestResult>
  }
  // Why: shell-only — confirmed. `import`/`importPetBundle` open a native
  // Electron `dialog.showOpenDialog` tied to the sender's `BrowserWindow`;
  // `read`/`delete` operate on files under this installation's
  // `app.getPath('userData')`, addressable only by the id the native picker
  // just minted. There is no host-wide pet-asset contract and no web
  // implementation at all (`window.api.pet` is undefined on web builds) —
  // building one would be a new host-shared-asset feature, not a Phase 4 move.
  pet: {
    import: () => Promise<CustomPet | null>
    importPetBundle: () => Promise<CustomPet | null>
    read: (id: string, fileName: string, kind?: 'image' | 'bundle') => Promise<ArrayBuffer | null>
    delete: (id: string, fileName: string, kind?: 'image' | 'bundle') => Promise<void>
  }
  emulator: EmulatorApi
  stats: StatsApi
  claudeUsage: ClaudeUsageApi
  codexUsage: CodexUsageApi
  openCodeUsage: OpenCodeUsageApi
  // Why: shell-only, not a missing-procedure gap — `aiVaultContract.listSessions`
  // (see `main/runtime/rpc/orpc/router-direct/ai-vault.ts`) already exists and
  // the web adapter calls it, but it only ever answers for one host: it wraps
  // `runtime.listAiVaultSessions()`, the same local-only scan cache this
  // preload member's `executionHostScope: 'local'` case also hits (see the
  // `Why:` in `main/ai-vault/ai-vault.ts`). The `'all'`/remote-host case this
  // preload member also serves goes through a *different*, Electron-bootstrap-
  // wired function in that same file (`scanAiVaultSessionsByHostScope`,
  // configured via `registerAiVaultHandlers`'s `getActiveRuntimeAiVaultHostInfos`/
  // `scanRuntimeAiVaultSessions` options) that fans this same host out to every
  // paired runtime peer and merges the results — the orchestrator side of the
  // same peer-to-peer call the contract procedure answers on the *other* end.
  // Routing this call site to the bare contract procedure would quietly drop
  // that merge for any panel not scoped to `'local'`. `listSubagentSessions`
  // stays too: a local-filesystem-only read (explicitly empty for a non-local
  // `executionHostId`) with no contract leaf yet — the web adapter's own
  // `Why:` next to its no-op stub already says so.
  aiVault: AiVaultApi
  // Why: genuine forward gap, not migrated this slice. `main/friday/service.ts`
  // Why: shell-only by construction, not an un-migrated gap. The session
  // itself is host-side (`runtime.createTerminal`/`closeTerminal`), but
  // `revealFridayChat` requires `notifier.revealTerminalSession` and throws
  // `runtime_unavailable` without it — Friday's visible surface is a tab in
  // the *local* floating workspace, so it needs a renderer window on the
  // machine running the shell. A paired web client has none on the runtime
  // host, which is why the web adapter rejects rather than routing. Adding a
  // `friday.*` contract procedure would not make it work.
  friday: {
    getOrCreate: () => Promise<FridaySession>
    restart: () => Promise<FridaySession>
  }
  // Why: worktree-owned reads, writes, listings, searches, imports, and watches
  // route through `files.*`. This adapter is limited to native downloads and
  // explicitly authorized absolute paths that cannot use worktree-relative
  // addressing, including OS drag-and-drop sources.
  git: {
    status: (args: {
      worktreePath: string
      connectionId?: string
      includeIgnored?: boolean
      bypassEffectiveUpstreamNegativeCache?: boolean
      reuseLineStats?: boolean
      requestToken?: string
    }) => Promise<GitStatusResult>
    // Why: cancellation partner for the `status` call above, not a separate
    // gap. It is only reachable via `git-client.ts`'s `callLocalGitStatus`,
    // itself gated on `!context.worktreeId` — the same retained local-fallback
    // branch as the rest of this group (Phase 5 step 1: the runtime `path:`
    // selector can't resolve an unregistered worktree yet). The registered-
    // worktree path cancels via `AbortSignal` instead (`client.git.status`
    // with `{ signal }`); the two are equivalent, not duplicates.
    cancelStatus: (args: { requestToken: string }) => Promise<void>
    submoduleStatus: (args: {
      worktreePath: string
      submodulePath: string
      connectionId?: string
      area?: GitStagingArea
    }) => Promise<GitStatusResult>
    checkIgnored: (args: {
      worktreePath: string
      paths: string[]
      connectionId?: string
    }) => Promise<string[]>
    // Why: genuine gap, not part of the git-client.ts local/runtime split —
    // no contract member exists for either. Scans this machine's filesystem
    // for oversized untracked folders and offers to append one to
    // .gitignore; the only caller (source-control/controller/status-refresh.tsx)
    // is gated to `getActiveRuntimeTarget(...).kind === 'local'` so a worktree
    // hosted on a non-local runtime environment is never scanned/written on
    // the wrong machine. Building a runtime equivalent would be new work, not
    // a migration of an existing one.
    findHugeFoldersToIgnore: (args: { worktreePath: string }) => Promise<string[]>
    appendGitignore: (args: { worktreePath: string; folderName: string }) => Promise<boolean>
    history: (
      args: { worktreePath: string; connectionId?: string } & GitHistoryOptions
    ) => Promise<GitHistoryResult>
    conflictOperation: (args: {
      worktreePath: string
      connectionId?: string
    }) => Promise<GitConflictOperation>
    abortMerge: (args: { worktreePath: string; connectionId?: string }) => Promise<void>
    abortRebase: (args: { worktreePath: string; connectionId?: string }) => Promise<void>
    abortRevert: (args: { worktreePath: string; connectionId?: string }) => Promise<void>
    addTag: (args: {
      worktreePath: string
      name: string
      commit: string
      message?: string
      force?: boolean
      connectionId?: string
    }) => Promise<GitAddTagResult>
    createBranch: (args: {
      worktreePath: string
      name: string
      commit: string
      checkout?: boolean
      connectionId?: string
    }) => Promise<GitCreateBranchResult>
    checkoutCommit: (args: {
      worktreePath: string
      commit: string
      connectionId?: string
    }) => Promise<GitCheckoutCommitResult>
    cherryPick: (args: {
      worktreePath: string
      commit: string
      mainline?: number
      connectionId?: string
    }) => Promise<GitCherryPickResult>
    revertCommit: (args: {
      worktreePath: string
      commit: string
      mainline?: number
      connectionId?: string
    }) => Promise<GitRevertResult>
    dropCommit: (args: {
      worktreePath: string
      commit: string
      connectionId?: string
    }) => Promise<GitDropCommitResult>
    mergeCommit: (args: {
      worktreePath: string
      commit: string
      noFf?: boolean
      squash?: boolean
      message?: string
      connectionId?: string
    }) => Promise<GitMergeCommitResult>
    rebaseOntoCommit: (args: {
      worktreePath: string
      commit: string
      connectionId?: string
    }) => Promise<GitRebaseOntoCommitResult>
    resetToCommit: (args: {
      worktreePath: string
      commit: string
      mode: 'soft' | 'mixed' | 'hard'
      connectionId?: string
    }) => Promise<GitResetToCommitResult>
    diff: (args: {
      worktreePath: string
      filePath: string
      staged: boolean
      compareAgainstHead?: boolean
      connectionId?: string
    }) => Promise<GitDiffResult>
    branchCompare: (args: {
      worktreePath: string
      baseRef: string
      connectionId?: string
    }) => Promise<GitBranchCompareResult>
    commitCompare: (args: {
      worktreePath: string
      commitId: string
      connectionId?: string
    }) => Promise<GitCommitCompareResult>
    upstreamStatus: (args: {
      worktreePath: string
      connectionId?: string
      pushTarget?: GitPushTarget
    }) => Promise<GitUpstreamStatus>
    fetch: (args: {
      worktreePath: string
      connectionId?: string
      pushTarget?: GitPushTarget
    }) => Promise<void>
    // Why: same-named-nothing-alike trap avoided, not a gap — the contract
    // member for this is `client.git.forkSync` (renamed, not missing).
    // `git-client.ts`'s `syncRuntimeGitForkDefaultBranch` already routes
    // registered worktrees there; this preload member only serves the same
    // `!context.worktreeId` local fallback as the rest of this group.
    syncFork: (args: {
      worktreePath: string
      connectionId?: string
      expectedUpstream: GitForkSyncExpectedUpstream
    }) => Promise<GitForkSyncResult>
    push: (args: {
      worktreePath: string
      publish?: boolean
      forceWithLease?: boolean
      connectionId?: string
      pushTarget?: GitPushTarget
    }) => Promise<void>
    pull: (args: {
      worktreePath: string
      connectionId?: string
      pushTarget?: GitPushTarget
    }) => Promise<void>
    fastForward: (args: {
      worktreePath: string
      connectionId?: string
      pushTarget?: GitPushTarget
    }) => Promise<void>
    rebaseFromBase: (args: {
      worktreePath: string
      baseRef: string
      connectionId?: string
    }) => Promise<void>
    branchDiff: (args: {
      worktreePath: string
      compare: {
        baseRef: string
        baseOid: string
        headOid: string
        mergeBase: string
      }
      filePath: string
      oldPath?: string
      connectionId?: string
    }) => Promise<GitDiffResult>
    commitDiff: (args: {
      worktreePath: string
      commitOid: string
      parentOid?: string | null
      filePath: string
      oldPath?: string
      connectionId?: string
    }) => Promise<GitDiffResult>
    commit: (args: {
      worktreePath: string
      message: string
      connectionId?: string
    }) => Promise<{ success: boolean; error?: string }>
    generateCommitMessage: (args: {
      worktreePath: string
      repoId?: string
      connectionId?: string
      sourceControlAiResolvedParams?: ResolvedSourceControlAiGenerationParams
      sourceControlAi?: SourceControlAiSettings
      agentCmdOverrides?: Partial<Record<TuiAgent, string>>
    }) => Promise<
      | { success: true; message: string; agentLabel?: string }
      | { success: false; error: string; canceled?: boolean }
    >
    discoverCommitMessageModels: (args: {
      agentId: string
      worktreePath?: string
      connectionId?: string
    }) => Promise<
      | {
          success: true
          capability: CommitMessageAgentCapability
          models: CommitMessageModelCapability[]
          defaultModelId: string
        }
      | { success: false; error: string }
    >
    cancelGenerateCommitMessage: (args: {
      worktreePath: string
      connectionId?: string
    }) => Promise<void>
    generatePullRequestFields: (args: {
      worktreePath: string
      repoId?: string
      base: string
      title: string
      body: string
      draft: boolean
      provider?: HostedReviewProvider
      useTemplate?: boolean
      connectionId?: string
      sourceControlAiResolvedParams?: ResolvedSourceControlAiGenerationParams
      sourceControlAi?: SourceControlAiSettings
      agentCmdOverrides?: Partial<Record<TuiAgent, string>>
    }) => Promise<
      | {
          success: true
          fields: { base: string; title: string; body: string; draft: boolean }
          agentLabel?: string
          branchChangedByPreparation?: boolean
        }
      | { success: false; error: string; canceled?: boolean; branchChangedByPreparation?: boolean }
    >
    cancelGeneratePullRequestFields: (args: {
      worktreePath: string
      connectionId?: string
    }) => Promise<void>
    stage: (args: {
      worktreePath: string
      filePath: string
      connectionId?: string
    }) => Promise<void>
    bulkStage: (args: {
      worktreePath: string
      filePaths: string[]
      connectionId?: string
    }) => Promise<void>
    unstage: (args: {
      worktreePath: string
      filePath: string
      connectionId?: string
    }) => Promise<void>
    bulkUnstage: (args: {
      worktreePath: string
      filePaths: string[]
      connectionId?: string
    }) => Promise<void>
    discard: (args: {
      worktreePath: string
      filePath: string
      connectionId?: string
    }) => Promise<void>
    bulkDiscard: (args: {
      worktreePath: string
      filePaths: string[]
      connectionId?: string
    }) => Promise<void>
    remoteFileUrl: (args: {
      worktreePath: string
      relativePath: string
      line: number
      connectionId?: string
    }) => Promise<string | null>
    remoteCommitUrl: (args: {
      worktreePath: string
      sha: string
      connectionId?: string
    }) => Promise<string | null>
  }
  ui: {
    get: () => Promise<PersistedUIState>
    set: (args: Partial<PersistedUIState>) => Promise<void>
    recordFeatureInteraction: (id: FeatureInteractionId) => Promise<PersistedUIState>
  }
  // Why: shell-only by construction — this group IS the transport, not a
  // capability a runtime could provide. `list`/`resolve`/`remove`/
  // `disconnect`/`getStatus` manage *which* runtime environment to connect to
  // (deciding the target), so they cannot themselves be routed through a
  // target's contract without circularity. `call`/`subscribe` are the legacy
  // bare-method-name dispatcher this migration spent many slices eliminating
  // from feature call sites; the only remaining direct callers are
  // infrastructure that must precede or bypass typed oRPC negotiation by
  // design: `environment-compatibility.ts`'s two `call` sites pass
  // `STATUS_GET_CONTRACT.name`, the capability-negotiation bootstrap probe
  // itself (negotiating oRPC before negotiation is impossible), and
  // `orpc-legacy-client.ts`'s `callRuntimeRpc`/`createLegacyRuntimeOrpcClient`
  // is the oRPC `ClientLink` adapter for hosts that fell back to the legacy
  // JSON-RPC envelope — its "method" is `procedure.method` read off
  // `runtimeContract` by walking the oRPC path, not a literal string authored
  // in feature code. No remaining feature call site passes a bare method name.
  runtimeEnvironments: {
    list: () => Promise<PublicKnownRuntimeEnvironment[]>
    resolve: (args: { selector: string }) => Promise<PublicKnownRuntimeEnvironment>
    remove: (args: { selector: string }) => Promise<{ removed: PublicKnownRuntimeEnvironment }>
    disconnect: (args: {
      selector: string
    }) => Promise<{ disconnected: PublicKnownRuntimeEnvironment }>
    getStatus: (args: {
      selector: string
      timeoutMs?: number
    }) => Promise<RuntimeRpcResponse<RuntimeStatus>>
    call: (args: {
      selector: string
      method: string
      params?: unknown
      timeoutMs?: number
    }) => Promise<RuntimeRpcResponse<unknown>>
    subscribe: (
      args: {
        selector: string
        method: string
        params?: unknown
        timeoutMs?: number
      },
      callbacks: {
        onResponse: (response: RuntimeRpcResponse<unknown>) => void
        onBinary?: (bytes: Uint8Array<ArrayBufferLike>) => void
        onError?: (error: { code: string; message: string }) => void
        onClose?: () => void
      }
    ) => Promise<RuntimeEnvironmentSubscriptionHandle>
    // Why: lets shared renderer code (`renderer/runtime/orpc-client.ts`) reach a
    // paired web client's already-negotiated oRPC peer by contract path instead
    // of the legacy string-method dispatcher that `call`/`subscribe` above still
    // speak. Desktop never calls this — its environment oRPC goes through the
    // MessagePort tunnel in `orpc-environment-client.ts` — so the real
    // implementation lives only in the web preload shim.
    callOrpcProcedure: (
      args: {
        selector: string
        path: readonly string[]
        input: unknown
        timeoutMs?: number
      },
      options?: {
        signal?: AbortSignal
        // Why: carries `browser.screencast.subscribe` video frames — the one
        // event-iterator leaf a paired web client dispatches through this
        // member. `window.api` is a same-realm object on web (no
        // contextBridge boundary), so passing the callback through costs
        // nothing extra; Electron never calls this member at all.
        onBinary?: (bytes: Uint8Array<ArrayBufferLike>) => void
      }
    ) => Promise<unknown>
  }
  // Why: shell-only, same test as `speech`'s OpenAI key methods (切片 20) —
  // the session cookie is Electron `safeStorage`-encrypted (falls back to a
  // sniffed plaintext envelope) into a machine-bound
  // `~/.yiru/minimax-session-cookie.enc`. A secret bound to this OS
  // keychain is not a routable host concept.
  minimaxCredentials: {
    getStatus: () => Promise<{ configured: boolean }>
    saveCookie: (cookie: string) => Promise<{ configured: boolean }>
    clearCookie: () => Promise<{ configured: boolean }>
  }
  // Why: list/listRuns/create/update/delete/runNow migrated onto the
  // `automation.*` oRPC contract (packages/runtime-protocol/src/contract/
  // automations.ts) — `automation.runs` covers `listRuns` under a renamed
  // member, everything else kept its name. listExternalManagers/
  // listExternalRuns/createExternal/updateExternal/runExternalAction/
  // snapshotWorkspaceName migrated the same way onto `automation-
  // external.ts`'s members. Every renderer caller now goes through
  // `renderer/components/automations/automation-host-client.ts`'s
  // `callRuntimeOrpc`-backed helpers for both local and remote targets — this
  // preload group no longer carries any of them (2026-08-08, this slice).
  // `create`'s `projectId`/`workspaceId` looked like a contract gap (the
  // contract only takes `repo`/`workspace`) but is a verified false positive:
  // `YiruRuntime.createAutomation`/`updateAutomation` resolve
  // `repo`/`workspace` into `projectId`/`workspaceId` via
  // `resolveAutomationTarget` before calling the same `store.createAutomation`
  // the old IPC handler called directly — a remodeling, not a dropped field.
  automations: {
    // Why: runPrecheck only ever runs inside the local dispatch handshake
    // below — the precheck execution target (main/automations/
    // precheck-runner.ts) is `{type:'local'}` only, resolved against this
    // same process's store. It never executes for a remote host, so it stays
    // local-dispatch machinery rather than a Phase 4 target; see
    // markDispatchResult below.
    runPrecheck: (args: {
      automationId: string
      runId: string
    }) => Promise<AutomationPrecheckResult | null>
    // Why: local IPC mechanics — markDispatchResult/rendererReady report a
    // dispatch outcome back to the machine that just ran it, not a host
    // capability an independent client calls, so they stay off the
    // `automation.*` oRPC contract (Phase 5 slice S5). The dispatch *request*
    // that used to pair with these over `onDispatchRequested` now arrives as
    // the reverse `shellServices.automations.dispatch` call instead (see
    // renderer/components/automations/use-automation-dispatch-events.ts and
    // main/automations/service.ts `requestDispatch`) — this preload surface
    // no longer carries it.
    markDispatchResult: (result: AutomationDispatchResult) => Promise<AutomationRun>
    rendererReady: () => Promise<void>
  }
  // Why: already-covered, verified against `contract/host-capabilities.ts` —
  // `host.wsl.isAvailable`/`listDistros`, `host.pwsh.isAvailable`,
  // `host.gitBash.isAvailable` call the exact same `isWslAvailable`/
  // `listWslDistros`/`isPwshAvailable`/`isGitBashAvailable` from `~main/wsl`/
  // `~main/pwsh`/`~main/git-bash` (see `rpc/methods/host-capabilities.ts`).
  // `windows-terminal-capability-read.ts` already routes an environment
  // target through the contract; kept here only for the `target.kind ===
  // 'local'` branch — collapsing that local branch (as `memory-state.ts`'s
  // `diagnostics.memory` call now does for both targets) is separate Phase 5
  // work, not yet done for this group.
  /**
   * shell-only: listNetworkInterfaces/getPairingQR/listDevices/revokeDevice/
   * isWebSocketReady moved to the `mobile.*` oRPC contract
   * (mobile-host-pairing.ts) — they describe a runtime host's own reachable
   * addresses and device registry, not this shell. The three members left
   * here inspect/repair the Windows Defender Firewall on the machine running
   * this Electron shell, an OS-level operation with no runtime-host meaning.
   */
  mobile: {
    getWindowsFirewallStatus: (args?: { address?: string }) => Promise<
      | { supported: false }
      | {
          supported: true
          port: number
          ruleAllowed: boolean
          blockingRuleDetected: boolean
          privateFirewallEnabled: boolean
          networkCategory: 'private' | 'public' | 'domain' | 'unknown'
          inspectionAvailable: boolean
        }
    >
    repairWindowsFirewall: () => Promise<
      { ok: true } | { ok: false; reason: 'cancelled' | 'failed' | 'unsupported' }
    >
    openWindowsNetworkSettings: () => Promise<boolean>
  }
  // Why: catalog reads, model download/delete, and OpenAI-key management
  // moved to the `speech.models.*`/`speech.openaiKey.*` runtime contract —
  // host-CRUD with no per-client identity, the same shape mobile already
  // drives remotely (see `main/runtime/yiru-runtime.ts`'s
  // `listMobileSpeechModels`/`downloadMobileSpeechModel`/
  // `deleteMobileSpeechModel`/`getSpeechOpenAiKeyStatus` family and
  // `dictation/state.ts`'s `refreshModelStates`, which now calls
  // `speech.models.list` on the local target instead of this preload).
  // `cancelDownload` (formerly here) had zero renderer callers and was
  // dropped rather than migrated — `model-manager.ts`'s own
  // `cancelDownload` stays, just no longer preload-exposed.
  // What's left below is genuinely shell-only: microphone capture is local
  // (getUserMedia -> preload -> main). Its lifecycle events now use
  // `speech.events.subscribe`; the 16kHz audio feed does not.
  // Model-download progress/failure now comes off the shared
  // `speech.events.subscribe` stream instead (`speech-events-client.ts`),
  // since that part of the flow has no per-client identity either.
  speech: {
    // Why: microphone permission belongs to the shell. Dictation lifecycle and
    // audio chunks use `speech.dictation.*` on the selected runtime host.
    ensureMicrophoneAccess: () => Promise<void>
  }
}
