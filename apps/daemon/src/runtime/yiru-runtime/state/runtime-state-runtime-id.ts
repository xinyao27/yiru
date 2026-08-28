import { randomUUID } from 'node:crypto'

import type {
  RuntimeBrowserGuestEvent,
  RuntimeDriverEvent,
  RuntimeHostProgressEvent,
  RuntimeAgentStatusEvent,
  RuntimeEmulatorEvent,
  RuntimeGitHubEvent,
  RuntimeNestedRepoScanProgressEvent,
  RuntimeSettingsChangedEvent,
  RuntimeSkillUpdateRunEvent,
  RuntimeUIChangedEvent,
  RuntimeWorkspacePortAdvertisedUrlChangedEvent,
  RuntimeWorktreeStateEvent
} from '@yiru/runtime-protocol/contract'
import type { createAgentStatusOscProcessor } from '@yiru/runtime-protocol/workbench/agent/status-osc'
import type { RuntimeClientEvent } from '@yiru/runtime-protocol/workbench/runtime-client-events'
import type {
  RuntimeMobileSessionCreateTerminalResult,
  RuntimeMobileSessionTabsResult,
  RuntimeMobileSessionTabsSnapshot
} from '@yiru/runtime-protocol/workbench/runtime-types'
import type { TerminalKittyKeyboardModeTracker } from '@yiru/runtime-protocol/workbench/terminal/kitty-keyboard-mode-tracker'
import type { WorkspaceCleanupScanProgress } from '@yiru/runtime-protocol/workbench/workspace/cleanup'
import type { WorkspaceSpaceScanProgress } from '@yiru/runtime-protocol/workbench/workspace/space-types'
import type { EmulatorBridge } from '~main/emulator/bridge'
import type { gitSpawn } from '~main/git/runner/runner'
import {
  createMobileSessionTabsNotifyCoalescer,
  type MobileSessionTabsNotifyCoalescer
} from '~main/runtime/mobile-session-tabs-notify-coalescer'
import type { OrchestrationDb } from '~main/runtime/orchestration/db'
import type { ShellServicesConnectionId } from '~main/runtime/rpc/orpc/shell-services-identity'
import type { AgentDetector } from '~main/stats/agent-detector'

import { RuntimeCompositionContract } from '../contracts/runtime-composition-contract'
import type { PtyForegroundAgentRefresh } from '../model/terminal-launch'
import type { RuntimePtyController } from '../model/terminal-observation'
import type { TerminalTailWaitState } from '../model/terminal-tail-state'
import type { ResolvedWorktreeCache, ResolvedWorktreeInFlight } from '../model/worktree-resolution'

export abstract class RuntimeStateRuntimeId extends RuntimeCompositionContract {
  protected readonly runtimeId = randomUUID()

  protected readonly startedAt = Date.now()

  protected mobileSessionTabsByWorktree = new Map<string, RuntimeMobileSessionTabsSnapshot>()
  // Why: idempotency map for mobile terminal creation — a retried create with the
  // same clientMutationId returns the in-flight operation instead of duplicating.

  protected mobileTerminalCreateByMutationId = new Map<
    string,
    Promise<RuntimeMobileSessionCreateTerminalResult>
  >()
  // Why: a mobile create waits for the renderer to publish the new tab's surface
  // via graph-sync, but a throttled/hidden renderer can park that past the surface
  // timeout and the create would then destroy the live PTY (#7587). This lets the
  // renderer's own PTY spawn publish the surface main-side, scoped to in-flight
  // creates so ordinary renderer spawns never publish here.

  protected pendingMobileTerminalCreatesByKey = new Map<
    string,
    {
      activate: boolean
      selectIfNoActiveTab: boolean
    }
  >()

  protected mobileSessionTabListeners = new Set<
    (snapshot: RuntimeMobileSessionTabsResult) => void
  >()
  // Why: coalesces title/status-driven session.tabs emits so spinner churn
  // doesn't fan out (and per-client JSON.stringify) a snapshot several times a
  // second. Emit reads the latest snapshot, so only the freshest version ships.

  protected readonly mobileSessionTabsNotifyCoalescer: MobileSessionTabsNotifyCoalescer =
    createMobileSessionTabsNotifyCoalescer((worktreeId) =>
      this.notifyMobileSessionTabsChangedNow(worktreeId)
    )

  protected ptyController: RuntimePtyController | null = null

  protected shellConnectionId: ShellServicesConnectionId | null = null

  protected clientEventListeners = new Set<(event: RuntimeClientEvent) => void>()

  protected browserGuestEventListeners = new Set<(event: RuntimeBrowserGuestEvent) => void>()

  protected driverEventListeners = new Set<(event: RuntimeDriverEvent) => void>()

  protected hostProgressEventListeners = new Set<(event: RuntimeHostProgressEvent) => void>()

  protected worktreeStateEventListeners = new Set<(event: RuntimeWorktreeStateEvent) => void>()

  protected githubEventListeners = new Set<(event: RuntimeGitHubEvent) => void>()

  protected settingsEventListeners = new Set<(event: RuntimeSettingsChangedEvent) => void>()

  protected workspacePortEventListeners = new Set<
    (event: RuntimeWorkspacePortAdvertisedUrlChangedEvent) => void
  >()

  protected uiEventListeners = new Set<(event: RuntimeUIChangedEvent) => void>()

  protected agentStatusEventListeners = new Set<(event: RuntimeAgentStatusEvent) => void>()

  protected skillUpdateRunEventListeners = new Set<(event: RuntimeSkillUpdateRunEvent) => void>()

  protected emulatorEventListeners = new Set<(event: RuntimeEmulatorEvent) => void>()

  protected nestedRepoScanEventListeners = new Set<
    (event: RuntimeNestedRepoScanProgressEvent) => void
  >()

  protected workspaceCleanupScanEventListeners = new Set<
    (event: WorkspaceCleanupScanProgress) => void
  >()

  protected workspaceSpaceScanEventListeners = new Set<
    (event: WorkspaceSpaceScanProgress) => void
  >()

  protected forkBackfillStarted = false

  protected emulatorBridge: EmulatorBridge | null = null

  protected resolvedWorktreeCache: ResolvedWorktreeCache | null = null

  protected resolvedWorktreeInFlight: ResolvedWorktreeInFlight | null = null

  protected resolvedWorktreeGeneration = 0

  protected cloneInFlightByPath = new Map<string, Promise<void>>()

  protected activeRepoClone: ReturnType<typeof gitSpawn> | null = null
  // Why: two simultaneous `yiru .` requests must share the second request's
  // post-registration lookup instead of racing duplicate repo records into disk.

  protected workspacePathOpenTail: Promise<void> = Promise.resolve()

  protected agentDetector: AgentDetector | null = null

  protected ptyForegroundAgentRefreshes = new Map<string, PtyForegroundAgentRefresh>()

  protected ptyDelayedForegroundSnapshotTitleObservations = new Map<string, number>()

  protected _orchestrationDb: OrchestrationDb | null = null

  protected readonly orchestrationFederationTimers = new Map<
    string,
    ReturnType<typeof setInterval>
  >()

  protected readonly orchestrationFederationSyncs = new Map<string, Promise<void>>()

  protected readonly orchestrationFederationWarnings = new Set<string>()
  // Why: startup draft paste can subscribe after the agent already emitted its
  // ready marker. Keep a bounded raw buffer so fast startup output is replayed.

  protected recentPtyOutputById = new Map<string, string>()

  protected setupCompletionTokenByPtyId = new Map<string, string>()

  protected titleObservationSequence = 0

  protected ptyOutputSequenceById = new Map<string, number>()

  protected ptyWireByteSequenceById = new Map<string, bigint>()

  protected ptyTransportGenerationById = new Map<string, string>()

  protected providerSequenceInitializedPtys = new Set<string>()

  protected providerSequenceOffsetByPtyId = new Map<string, number>()

  protected providerSnapshotPreferredPtys = new Set<string>()

  protected providerModeTrackersByPtyId = new Map<string, TerminalKittyKeyboardModeTracker>()

  protected providerModeSnapshotScansByPtyId = new Map<
    string,
    Set<TerminalKittyKeyboardModeTracker>
  >()

  protected recentPtyPathCandidatesById = new Map<string, string[]>()
  // Why: OSC 9999 status can span PTY chunks. Keeping parser state in the
  // runtime lets hidden/model-owned terminals observe agent state without a
  // mounted xterm view.
  // Why a throttle: the blocked-reason check builds and scans two full wait
  // texts (<=256KB each, lowercased) — measured at ~85% of onPtyData's cost
  // under a TUI flood (findings log 2026-07-03). PTY chunk boundaries are
  // arbitrary, so running the identical computation over coalesced chunks at
  // a bounded cadence (plus a trailing-edge timer so burst-final state is
  // always evaluated) preserves semantics while removing it from the hot path.

  protected waitBlockedCheckStateByPtyId = new Map<
    string,
    {
      lastAt: number
      lastWaitState: TerminalTailWaitState | null
      appended: string
      keywordCarry: string
      timer: ReturnType<typeof setTimeout> | null
    }
  >()

  protected agentStatusOscProcessorsByPtyId = new Map<
    string,
    ReturnType<typeof createAgentStatusOscProcessor>
  >()
  // Why: per-PTY shared title trackers (all-titles ordering + stale-working
  // timer) replace last-title-per-chunk scanning so main observes the same
  // intra-chunk working→idle transitions the renderer does (issue #1083).
  // Lazily created like agentStatusOscProcessorsByPtyId; disposed on PTY exit.
}
