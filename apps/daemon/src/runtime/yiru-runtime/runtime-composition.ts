import type { AgentStatusIpcPayload } from '@yiru/runtime-protocol/model/agent'
import type { RuntimeCapability } from '@yiru/runtime-protocol/protocol-version'
import type { RuntimeDesktopWindowStatus } from '@yiru/runtime-protocol/workbench/runtime-types'
import type { RuntimeSyncedTab } from '@yiru/runtime-protocol/workbench/runtime-types'
import type {
  WarpThemeImportPreview,
  WarpThemeImportSource
} from '@yiru/runtime-protocol/workbench/terminal/custom-themes'
import type { TerminalSideEffectBatch } from '@yiru/runtime-protocol/workbench/terminal/side-effect-facts'
import type { GhosttyImportPreview } from '@yiru/runtime-protocol/workbench/types'
import type { IPtyProvider } from '~main/agents/provider-runtime/types'
import { configureAiVaultSessionSources } from '~main/ai-vault/cached-session-list'
import type { AiVaultSessionRuntimeTarget } from '~main/ai-vault/session/root-configuration'
import type { RuntimeHostProcessMetricsProvider } from '~main/memory/collector'
import type { Store } from '~main/persistence/store'
import type { RuntimeWindowTarget } from '~main/runtime/host/renderer-target'
import { AgentDetector } from '~main/stats/agent-detector'
import type { StatsCollector } from '~main/stats/collector'
import type { ProviderUsageStores } from '~main/stats/summary'

import type { OrchestrationEnvironmentTransport } from '../orchestration/environment-transport'
import { RuntimeProviderUsage } from '../provider-usage/capabilities'
import { registerConptyDa1OverrideInstaller } from '../terminal-model-query-authority'
import { TerminalSessionAuthority } from '../terminal-session-authority/terminal-session-authority'
import { registerTerminalViewAttributesApplier } from '../terminal-view-attribute-store'
import type {
  RuntimeHeadlessTerminal,
  RuntimeTerminalAgentStatusEvent
} from './model/terminal-observation'
import type { RuntimeLeafRecord, RuntimePtyWorktreeRecord } from './model/terminal-records'
import type { MessageWaiter, TerminalHandleRecord, TerminalWaiter } from './model/terminal-startup'
import { RuntimeStateAcquireFileWatcherRemoval } from './state/runtime-state-acquire-file-watcher-removal'

export abstract class RuntimeComposition extends RuntimeStateAcquireFileWatcherRemoval {
  protected readonly store: Store

  protected readonly terminalSessions: TerminalSessionAuthority<
    RuntimeSyncedTab,
    RuntimeLeafRecord,
    RuntimePtyWorktreeRecord,
    TerminalHandleRecord,
    RuntimeHeadlessTerminal,
    TerminalWaiter,
    MessageWaiter
  >

  protected readonly orchestrationEnvironmentTransport: OrchestrationEnvironmentTransport | null

  protected readonly getLocalProviderFn: (() => IPtyProvider) | null

  protected readonly getSshProviderFn: ((connectionId: string) => IPtyProvider | undefined) | null

  protected readonly onPtyStopped: ((ptyId: string) => void) | null

  protected readonly onTerminalAgentStatus:
    | ((event: RuntimeTerminalAgentStatusEvent) => void)
    | null

  protected readonly onTerminalSideEffects: ((batch: TerminalSideEffectBatch) => void) | null

  protected readonly getAgentStatusSnapshotFn: (() => AgentStatusIpcPayload[]) | null

  protected readonly buildAgentHookPtyEnv: (() => Record<string, string>) | null

  protected readonly getDesktopWindowStatusFn: () => RuntimeDesktopWindowStatus

  protected readonly getWindowByIdFn: (windowId: number) => RuntimeWindowTarget | null

  protected readonly getHostProcessMetricsFn: RuntimeHostProcessMetricsProvider | undefined

  protected readonly disabledCapabilities: ReadonlySet<RuntimeCapability>

  protected readonly previewGhosttyImportForClientFn: (() => Promise<GhosttyImportPreview>) | null

  protected readonly previewWarpThemeImportForClientFn:
    | ((source: WarpThemeImportSource) => Promise<WarpThemeImportPreview>)
    | null

  readonly providerUsage: RuntimeProviderUsage
  // Why: notifications.report's job1 (throttle/dedup) moved here from the
  // legacy notifications:dispatch ipcMain closure — Phase 5 slice S3. Two
  // independent trackers because the desktop-notification cooldown and the
  // mobile-push cooldown key/reserve independently (a suppressed desktop
  // notification must not block the mobile push, and vice versa).

  constructor(
    store: Store,
    stats?: StatsCollector,
    deps?: {
      getLocalProvider?: () => IPtyProvider
      getSshProvider?: (connectionId: string) => IPtyProvider | undefined
      onPtyStopped?: (ptyId: string) => void
      onTerminalAgentStatus?: (event: RuntimeTerminalAgentStatusEvent) => void
      onTerminalSideEffects?: (batch: TerminalSideEffectBatch) => void
      // Why: agent status mostly arrives via hooks (agent-hooks/server), not OSC
      // terminal output. worktree.ps reads this at query time so mobile shows the
      // same inline agent rows the desktop sidebar does — same source, 1:1.
      getAgentStatusSnapshot?: () => AgentStatusIpcPayload[]
      // Why: Claude and Codex history roots must also be available under headless `yiru serve`.
      getAdditionalAiVaultCodexHomePaths?: () => readonly string[]
      resolveAiVaultClaudeProjectsDirs?: (
        target: AiVaultSessionRuntimeTarget
      ) => Promise<readonly string[]>
      buildAgentHookPtyEnv?: () => Record<string, string>
      getDesktopWindowStatus?: () => RuntimeDesktopWindowStatus
      getWindowById?: (windowId: number) => RuntimeWindowTarget | null
      getHostProcessMetrics?: RuntimeHostProcessMetricsProvider
      disabledCapabilities?: readonly RuntimeCapability[]
      // Why: Ghostty/Warp import preview need the full local `Store` (this
      // runtime's own `getSettings()` projection omits most of the settings
      // fields they diff against) plus, for Warp's `chooseFile`/`chooseFolder`
      // sources, an Electron dialog — both are shell-owned capabilities the
      // headless-safe runtime cannot reach on its own.
      previewGhosttyImportForClient?: () => Promise<GhosttyImportPreview>
      previewWarpThemeImportForClient?: (
        source: WarpThemeImportSource
      ) => Promise<WarpThemeImportPreview>
      providerUsageStores?: ProviderUsageStores
      orchestrationEnvironmentTransport?: OrchestrationEnvironmentTransport
    }
  ) {
    super()
    this.store = store
    this.terminalSessions = new TerminalSessionAuthority({
      rejectHandle: (handle) => this.rejectWaitersForHandle(handle, 'terminal_handle_stale'),
      rejectAllHandles: () => this.rejectAllWaiters('terminal_handle_stale'),
      notifyRemoteViewPresence: (ptyId) => this.notifyRemoteTerminalViewPresenceChanged(ptyId),
      notifyDriverChanged: (ptyId, driver) => {
        this.emitDriverEvent({ type: 'terminalDriverChanged', ptyId, driver })
      },
      getPtySize: (ptyId) => this.getTerminalSize(ptyId),
      resizePty: (ptyId, cols, rows) => this.ptyController?.resize?.(ptyId, cols, rows) ?? true,
      resizeHeadlessTerminal: (ptyId, cols, rows) => this.resizeHeadlessTerminal(ptyId, cols, rows),
      notifyFitOverride: (ptyId, mode, cols, rows) => {
        this.emitDriverEvent({ type: 'terminalFitOverrideChanged', ptyId, mode, cols, rows })
      }
    })
    if (stats) {
      this.stats = stats
      this.agentDetector = new AgentDetector(stats)
    }
    this.providerUsage = new RuntimeProviderUsage(deps?.providerUsageStores ?? null)
    this.orchestrationEnvironmentTransport = deps?.orchestrationEnvironmentTransport ?? null
    this.getAgentStatusSnapshotFn = deps?.getAgentStatusSnapshot ?? null
    // Why: both managed-provider root resolvers must work without desktop IPC registration.
    if (deps?.getAdditionalAiVaultCodexHomePaths || deps?.resolveAiVaultClaudeProjectsDirs) {
      configureAiVaultSessionSources({
        getAdditionalCodexHomePaths: deps.getAdditionalAiVaultCodexHomePaths,
        resolveClaudeProjectsDirs: deps.resolveAiVaultClaudeProjectsDirs
      })
    }
    // Why: the daemon adapter is installed via `setLocalPtyProvider()` during
    // attachMainWindowServices, AFTER this service is constructed. Capturing
    // `getLocalPtyProvider()` at construction time would freeze a reference to
    // the pre-daemon `LocalPtyProvider` and miss the routed adapter. Resolve
    // lazily via thunk so teardown always sees the currently-installed
    // provider (design §4.3 wire-up).
    this.getLocalProviderFn = deps?.getLocalProvider ?? null
    this.getSshProviderFn = deps?.getSshProvider ?? null
    this.onPtyStopped = deps?.onPtyStopped ?? null
    this.onTerminalAgentStatus = deps?.onTerminalAgentStatus ?? null
    this.buildAgentHookPtyEnv = deps?.buildAgentHookPtyEnv ?? null
    this.getDesktopWindowStatusFn = deps?.getDesktopWindowStatus ?? (() => 'openable')
    this.getWindowByIdFn = deps?.getWindowById ?? (() => null)
    this.getHostProcessMetricsFn = deps?.getHostProcessMetrics
    this.disabledCapabilities = new Set(deps?.disabledCapabilities)
    this.previewGhosttyImportForClientFn = deps?.previewGhosttyImportForClient ?? null
    this.previewWarpThemeImportForClientFn = deps?.previewWarpThemeImportForClient ?? null
    this.onTerminalSideEffects = deps?.onTerminalSideEffects ?? null
    // Why: the ConPTY spawn mark can land after daemon stream data already
    // created this PTY's emulator; the mark retrofits the DA1 override here
    // (terminal-query-authority.md §ConPTY DA1).
    registerConptyDa1OverrideInstaller((ptyId) => this.ensureNativeWindowsConptyDa1Override(ptyId))
    // Why: a renderer attribute push must reach already-live emulators too —
    // cursor options for DECRQSS/DECRQM parity plus the per-PTY OSC color
    // override reset a theme apply implies (terminal-query-authority.md
    // §View-attribute bridge).
    registerTerminalViewAttributesApplier((attributes) => {
      for (const state of this.terminalSessions.listEmulators()) {
        state.emulator.applyPushedViewAttributes(attributes)
      }
    })
  }
}
