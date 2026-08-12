/* eslint-disable max-lines -- Why: the preload contract is intentionally centralized in one declaration file so renderer and preload stay in lockstep when IPC surfaces change. */
import type { HostedReviewProvider } from '@yiru/workbench-model/review'

import type { AppIdentity } from '../app-identity'
import type {
  CommitMessageAgentCapability,
  CommitMessageModelCapability
} from '../commit-message/agent-spec'
import type { FeatureInteractionId } from '../feature-interactions'
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
import type { ProjectExecutionRuntimeResolution } from '../project-execution-runtime'
import type { ResolvedSourceControlAiGenerationParams } from '../source-control/ai'
import type { SourceControlAiSettings } from '../source-control/ai-types'
import type {
  BrowserSessionProfileSource,
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

import type {
  AiVaultListArgs,
  AiVaultListResult,
  AiVaultSubagentListArgs,
  AiVaultSubagentListResult
} from '@yiru/workbench-model/agent'

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
  runtimeConnection: {
    getCredentials: () => Promise<{
      endpoint: string
      processToken: Uint8Array<ArrayBuffer>
    }>
  }
  // Why: this group's `on*` members (onDeliveryResyncRequest, onData,
  // onReplay, onModelRestoreNeeded, onSideEffect, onExit,
  // onClearBufferRequest) are never a runtime migration gap.
  // `onSerializeBufferRequest`/`sendSerializedBuffer` moved to the
  // shell-services reverse contract (Phase 5 step 4, `pty` group A —
  // typed runtime contracts) and no longer live here. Per-keystroke
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
}
