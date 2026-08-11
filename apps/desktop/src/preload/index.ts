import { electronAPI } from '@electron-toolkit/preload'
import type {
  ShellServicesNotificationsDismissOutput,
  ShellServicesNotificationsDisplayInput,
  ShellServicesNotificationsDisplayOutput
} from '@yiru/runtime-protocol/contract'
import type { RuntimeRpcResponse } from '@yiru/runtime-protocol/rpc-envelope'
import type { PreloadApi } from '@yiru/shared/preload/api-types'
import type { SleepingAgentLaunchConfig } from '@yiru/workbench-model/agent'
import type { AiVaultListArgs, AiVaultSubagentListArgs } from '@yiru/workbench-model/agent'
/* eslint-disable max-lines -- Why: the preload bridge is the audited contract between
renderer and Electron. Keeping the IPC surface co-located in one file makes security
review and type drift checks easier than scattering these bindings across modules. */
import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AppIdentity } from '~shared/app-identity'
import type {
  AutomationDispatchResult,
  AutomationPrecheckResult,
  AutomationRun
} from '~shared/automations-types'
import type { StartupCommandDelivery } from '~shared/codex-startup-delivery'
import type {
  CrashReportBreadcrumbData,
  CrashReportCopyDiagnosticsArgs,
  CrashReportSubmitArgs,
  CrashReportSubmitResult,
  ReactErrorBoundaryReportArgs,
  ReactErrorBoundaryReportResult
} from '~shared/crash-reporting'
import {
  YIRU_EDITOR_PREPARE_HOT_EXIT_EVENT,
  type EditorPrepareHotExitDetail
} from '~shared/editor-save-events'
import type { FridaySession } from '~shared/friday-types'
import type { AppStarSource } from '~shared/gh-star-source'
import type { KeybindingActionId, KeybindingFileSnapshot } from '~shared/keybindings'
import type {
  LocalhostWorktreeLabelResult,
  LocalhostWorktreeLabelRoute
} from '~shared/localhost-worktree-labels'
import {
  YIRU_INTERNAL_FILE_DRAG_TYPE,
  createNativeFileDropPayload,
  createRejectedNativeFileDropPayload,
  hasNativeFileDragTypes,
  NATIVE_FILE_DROP_MAX_PATHS,
  resolveNativeFileDropPath,
  type NativeDropResolution,
  type NativeFileDropPathEntry
} from '~shared/native-file-drop'
import type { ProjectExecutionRuntimeResolution } from '~shared/project-execution-runtime'
import type { PtyMainDeliveryDiagnostics } from '~shared/pty-delivery-diagnostics'
import type { PtyModelRestoreNeededEvent } from '~shared/pty-model-restore-marker'
import type {
  PtyRendererDeliveryHealthReply,
  PtyRendererDeliveryStateReport
} from '~shared/pty-renderer-delivery-health'
import type { PublicKnownRuntimeEnvironment } from '~shared/runtime-environments'
import {
  RUNTIME_ORPC_CONNECT_PORT_CHANNEL,
  parseRuntimeOrpcConnectPortRequest
} from '~shared/runtime-orpc-message-port'
import type {
  RuntimeBrowserDriverState,
  RuntimeStatus,
  RuntimeSyncWindowGraphResult,
  RuntimeSyncWindowGraph,
  RuntimeTerminalDriverState
} from '~shared/runtime-types'
import {
  SHELL_SERVICES_CONNECT_CHANNEL,
  SHELL_SERVICES_CONNECT_MESSAGE
} from '~shared/shell-services-message-port'
import type { TelemetryConsentState } from '~shared/telemetry-consent-types'
import type { AgentKind, LaunchSource, RequestKind } from '~shared/telemetry-events'
import type { TerminalSideEffectBatch } from '~shared/terminal/side-effect-facts'
import type { TerminalViewAttributes } from '~shared/terminal/view-attributes'
import type {
  CustomPet,
  GitHubPRRefreshCandidate,
  GitHubPRRefreshReason,
  NotificationDeliveryProbeResult,
  NotificationPermissionStatusResult,
  NotificationSoundDataResult,
  NotificationSoundPathResult,
  NotificationSoundResult,
  OnboardingState,
  FloatingTerminalCwdRequest,
  MarkdownDocument,
  TuiAgent,
  UpdateStatus
} from '~shared/types'
import {
  YIRU_APP_RESTART_ABORTED_EVENT,
  YIRU_APP_RESTART_STARTED_EVENT,
  YIRU_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT,
  YIRU_UPDATER_QUIT_AND_INSTALL_STARTED_EVENT
} from '~shared/updater-renderer-events'

import { subscribeRuntimeEnvironmentFromPreload } from './runtime-environment-subscriptions'
import type { RuntimeEnvironmentSubscriptionHandle } from './runtime-environment-subscriptions'

function forwardRuntimeOrpcPort(event: MessageEvent<unknown>): void {
  const request = parseRuntimeOrpcConnectPortRequest(event.data)
  if (!request) {
    return
  }
  if (event.source !== window || event.ports.length !== 1) {
    for (const port of event.ports) {
      port.close()
    }
    return
  }

  const [port] = event.ports
  ipcRenderer.postMessage(RUNTIME_ORPC_CONNECT_PORT_CHANNEL, request, [port])
}

window.addEventListener('message', forwardRuntimeOrpcPort)

// Why: mirrors forwardRuntimeOrpcPort in the opposite direction — main hands
// the renderer's isolated preload world the shell-services port, and it must
// cross back into the main world the same way the forward port crossed out
// of it, via window.postMessage's transfer list.
function forwardShellServicesPort(event: Electron.IpcRendererEvent): void {
  if (event.ports.length !== 1) {
    for (const port of event.ports) {
      port.close()
    }
    return
  }
  const [port] = event.ports
  window.postMessage({ type: SHELL_SERVICES_CONNECT_MESSAGE }, '*', [port])
}

ipcRenderer.on(SHELL_SERVICES_CONNECT_CHANNEL, forwardShellServicesPort)

type AppRestartPrepOptions = {
  startedEventName: string
  abortedEventName: string
}

function requestEditorHotExitBackup(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let claimed = false
    window.dispatchEvent(
      new CustomEvent<EditorPrepareHotExitDetail>(YIRU_EDITOR_PREPARE_HOT_EXIT_EVENT, {
        detail: {
          claim: () => {
            claimed = true
          },
          resolve,
          reject: (message) => {
            reject(new Error(message))
          }
        }
      })
    )

    // Why: restart paths can run before the editor autosave controller mounts.
    // With no claimant, there are no renderer-owned dirty buffers to back up.
    if (!claimed) {
      resolve()
    }
  })
}

async function prepareRendererForAppRestart({
  startedEventName,
  abortedEventName
}: AppRestartPrepOptions): Promise<void> {
  window.dispatchEvent(new Event(startedEventName))

  try {
    await requestEditorHotExitBackup()
  } catch (error) {
    window.dispatchEvent(new Event(abortedEventName))
    throw error
  }

  // Dispatch beforeunload now so terminal buffers are captured while panes are
  // still mounted; update installs later bypass the ordinary close sequence.
  window.dispatchEvent(new Event('beforeunload'))
}

// Why: one shared HTMLAudioElement per sound file, restarted from t=0 on each
// play, with an in-flight guard that drops new plays while the sound is still
// ringing. This mirrors VS Code's AccessibilitySignalService and GNOME's
// libcanberra: a burst of triggers self-dedupes by the sound's own duration
// (no magic time constant), while distinct sounds are still allowed to overlap.
// We also cache the decoded blob URL by path so we don't re-read 10MB from
// disk and re-transfer it over IPC on every notification.
let cachedNotificationSound: {
  path: string
  blobUrl: string
  audio: HTMLAudioElement
} | null = null
let isNotificationSoundPlaying = false
// Why: audio.play() can reject before ended/error fires; keep a cleanup hook
// so failed or replaced plays do not accumulate listeners on the cached Audio.
let cleanupNotificationSoundPlayback: (() => void) | null = null

function clearNotificationSoundPlaybackState(): void {
  cleanupNotificationSoundPlayback?.()
  cleanupNotificationSoundPlayback = null
  isNotificationSoundPlaying = false
}

function disposeCachedNotificationSound(): void {
  if (cachedNotificationSound) {
    clearNotificationSoundPlaybackState()
    cachedNotificationSound.audio.pause()
    cachedNotificationSound.audio.src = ''
    URL.revokeObjectURL(cachedNotificationSound.blobUrl)
    cachedNotificationSound = null
  }
}

/**
 * Walk the composed event path to classify which UI surface the native OS drop
 * landed on, and — for file-explorer drops — extract the nearest destination
 * directory from `data-native-file-drop-dir`.
 *
 * Why: the preload layer consumes native OS `drop` events before React can read
 * filesystem paths. If preload does not capture the destination directory at
 * drop time, the renderer can no longer tell whether the user meant "root" or
 * "inside this folder".
 */
function resolveNativeFileDrop(event: DragEvent): NativeDropResolution | null {
  const pathEntries: NativeFileDropPathEntry[] = []
  for (const entry of event.composedPath()) {
    if (entry instanceof HTMLElement) {
      pathEntries.push({
        nativeFileDropTarget: entry.dataset.nativeFileDropTarget,
        nativeFileDropDir: entry.dataset.nativeFileDropDir,
        terminalTabId: entry.dataset.terminalTabId,
        terminalPaneLeafId: entry.dataset.terminalPaneLeafId ?? entry.dataset.leafId
      })
    }
  }
  return resolveNativeFileDropPath(pathEntries)
}

// ---------------------------------------------------------------------------
// File drag-and-drop: handled here in the preload because webUtils (which
// resolves File objects to filesystem paths) is only available in Electron's
// preload/main worlds, not the renderer's isolated main world.
// ---------------------------------------------------------------------------
document.addEventListener(
  'dragover',
  (e) => {
    // Let in-app drags (e.g. file explorer drag-to-move) through to React handlers
    // so they can set their own dropEffect. Only override for native OS file drops.
    if (e.dataTransfer && !hasNativeFileDragTypes(e.dataTransfer.types)) {
      return
    }
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
  },
  true
)

document.addEventListener(
  'drop',
  (e) => {
    // Let in-app drags (e.g. file explorer → terminal) through to React handlers
    if (e.dataTransfer?.types.includes(YIRU_INTERNAL_FILE_DRAG_TYPE)) {
      return
    }

    e.preventDefault()
    e.stopPropagation()
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) {
      return
    }
    const resolution = resolveNativeFileDrop(e)

    // Why: resolving native File objects to paths is synchronous in preload.
    // Reject oversized gestures by count before touching every File object.
    if (files.length > NATIVE_FILE_DROP_MAX_PATHS) {
      ipcRenderer.send(
        'terminal:file-dropped-from-preload',
        createRejectedNativeFileDropPayload({
          byteLength: 0,
          pathCount: files.length,
          reason: 'too-many-paths',
          status: 'rejected'
        })
      )
      return
    }

    const paths: string[] = []
    for (let i = 0; i < files.length; i++) {
      // webUtils.getPathForFile is the Electron 28+ replacement for File.path
      const filePath = webUtils.getPathForFile(files[i])
      if (filePath) {
        paths.push(filePath)
      }
    }

    if (paths.length === 0) {
      return
    }

    // Why: when the explorer marker was present but no destination directory
    // could be resolved, the gesture is rejected entirely — no fallback to
    // editor, per the fail-closed requirement in design §7.1.
    if (resolution?.target === 'rejected') {
      return
    }

    const payload = createNativeFileDropPayload(resolution, paths)
    if (!payload) {
      return
    }
    // Why: preload must emit exactly one native-drop event per drop gesture.
    // The shared planner also rejects large path payloads without including
    // path contents in the failure event.
    ipcRenderer.send('terminal:file-dropped-from-preload', payload)
  },
  true
)

const startupDiagnosticsEnabled = process.env.YIRU_STARTUP_DIAGNOSTICS === '1'

// Custom APIs for renderer
const api = {
  app: {
    getIdentity: (): Promise<AppIdentity> => ipcRenderer.invoke('app:getIdentity'),
    relaunch: (): Promise<void> => ipcRenderer.invoke('app:relaunch'),
    restart: async (): Promise<void> => {
      await prepareRendererForAppRestart({
        startedEventName: YIRU_APP_RESTART_STARTED_EVENT,
        abortedEventName: YIRU_APP_RESTART_ABORTED_EVENT
      })
      try {
        return await ipcRenderer.invoke('app:restart')
      } catch (error) {
        window.dispatchEvent(new Event(YIRU_APP_RESTART_ABORTED_EVENT))
        throw error
      }
    },
    reload: (): Promise<void> => ipcRenderer.invoke('app:reload'),
    awaitFirstWindowStartupServices: (): Promise<void> =>
      ipcRenderer.invoke('app:awaitFirstWindowStartupServices'),
    startupDiagnostic: (event: string, details?: Record<string, unknown>): Promise<void> =>
      startupDiagnosticsEnabled
        ? ipcRenderer.invoke('app:startupDiagnostic', event, details)
        : Promise.resolve(),
    // Why: on macOS this returns the active input mode, or the layout ID when
    // no IME mode is selected, so renderer keyboard workarounds can distinguish
    // CJK IMEs and compose layouts from plain US QWERTY (see issue #1205).
    // Returns null on non-Darwin or when the defaults read fails.
    getKeyboardInputSourceId: (): Promise<string | null> =>
      ipcRenderer.invoke('app:getKeyboardInputSourceId'),
    setUnreadDockBadgeCount: (count: number): Promise<void> =>
      ipcRenderer.invoke('app:setUnreadDockBadgeCount', count),
    getFloatingTerminalCwd: (args?: FloatingTerminalCwdRequest): Promise<string> =>
      ipcRenderer.invoke('app:getFloatingTerminalCwd', args),
    getFloatingMarkdownDirectory: (): Promise<string> =>
      ipcRenderer.invoke('app:getFloatingMarkdownDirectory'),
    pickFloatingMarkdownDocument: (): Promise<MarkdownDocument | null> =>
      ipcRenderer.invoke('app:pickFloatingMarkdownDocument'),
    pickFloatingWorkspaceDirectory: (): Promise<string | null> =>
      ipcRenderer.invoke('app:pickFloatingWorkspaceDirectory')
  },

  yiruProfiles: {
    list: () => ipcRenderer.invoke('yiruProfiles:list'),
    createLocal: (args) => ipcRenderer.invoke('yiruProfiles:createLocal', args),
    switchProfile: (args) => ipcRenderer.invoke('yiruProfiles:switch', args),
    transferProject: (args) => ipcRenderer.invoke('yiruProfiles:transferProject', args),
    findProjectProfiles: (args) => ipcRenderer.invoke('yiruProfiles:findProjectProfiles', args)
  } satisfies PreloadApi['yiruProfiles'],

  repoHost: {
    pickFolder: () => ipcRenderer.invoke('repo-host:pickFolder'),
    pickFolders: () => ipcRenderer.invoke('repo-host:pickFolders'),
    pickDirectory: () => ipcRenderer.invoke('repo-host:pickDirectory'),
    removeForHost: (args) => ipcRenderer.invoke('repo-host:removeForHost', args),
    reorderForHost: (args) => ipcRenderer.invoke('repo-host:reorderForHost', args),
    cloneAbort: () => ipcRenderer.invoke('repo-host:cloneAbort'),
    getDefaultCreateProjectParent: (): Promise<string> =>
      ipcRenderer.invoke('repo-host:getDefaultCreateProjectParent')
  } satisfies PreloadApi['repoHost'],

  pty: {
    spawn: (opts: {
      cols: number
      rows: number
      cwd?: string
      cwdFallback?: 'worktree'
      env?: Record<string, string>
      command?: string
      launchConfig?: SleepingAgentLaunchConfig
      launchToken?: string
      launchAgent?: TuiAgent
      startupCommandDelivery?: StartupCommandDelivery
      connectionId?: string | null
      worktreeId?: string
      sessionId?: string
      shellOverride?: string
      projectRuntime?: ProjectExecutionRuntimeResolution
      terminalColorQueryReplies?: { foreground?: string; background?: string }
      // Why: hidden-at-spawn declaration — main marks the PTY hidden before
      // its first byte so the delivery gate + model responder own spawn-time
      // queries (terminal-query-authority.md §races).
      initiallyHidden?: boolean
      // Why: closes the SIGKILL race documented in INVESTIGATION.md by
      // letting main patch + sync-flush the (worktreeId, tabId, leafId →
      // ptyId) binding before pty:spawn returns. Only the renderer's
      // user-typing-Ctrl+T daemon-host path threads these.
      tabId?: string
      leafId?: string
      // Why: telemetry-plan.md§Agent launch semantics — main fires
      // `agent_started` only after the spawn succeeds. The renderer is the
      // source of truth for the launch metadata; main is the source of
      // truth for whether the launch happened. Loose typing here on
      // purpose: validation lives at the main-side schema validator.
      telemetry?: { agent_kind: AgentKind; launch_source: LaunchSource; request_kind: RequestKind }
    }): Promise<{
      id: string
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
    }> => ipcRenderer.invoke('pty:spawn', opts),

    write: (id: string, data: string): void => {
      ipcRenderer.send('pty:write', { id, data })
    },
    writeAccepted: (id: string, data: string): Promise<boolean> =>
      ipcRenderer.invoke('pty:writeAccepted', { id, data }),

    resize: (id: string, cols: number, rows: number): void => {
      ipcRenderer.send('pty:resize', { id, cols, rows })
    },
    claimViewport: (id: string, cols: number, rows: number): void => {
      ipcRenderer.send('pty:claimViewport', { id, cols, rows })
    },

    /** Why: measurement-only sibling of resize. Fires when a desktop pane
     * container measures real geometry (e.g. previously hidden tab becomes
     * visible) so the runtime's restore-target baseline can stay fresh
     * even while a mobile-fit override blocks pty:resize. Never resizes
     * the PTY. See docs/mobile-fit-hold.md. */
    reportGeometry: (id: string, cols: number, rows: number): void => {
      ipcRenderer.send('pty:reportGeometry', { id, cols, rows })
    },

    signal: (id: string, signal: string): void => {
      ipcRenderer.send('pty:signal', { id, signal })
    },

    /** Why: Cmd/Ctrl+K clears the renderer xterm, but the PTY host (ConPTY,
     * daemon emulator, SSH host buffer) keeps its own screen state and would
     * repaint the next prompt at the stale cursor row. */
    clearBuffer: (id: string): void => {
      ipcRenderer.send('pty:clearBuffer', { id })
    },

    ackColdRestore: (id: string): void => {
      ipcRenderer.send('pty:ackColdRestore', { id })
    },
    /** charCount is the legacy per-chunk delta; processedChars is the
     *  cumulative per-pty total (self-healing under lost ACK messages). */
    ackData: (id: string, charCount: number, processedChars?: number): void => {
      ipcRenderer.send('pty:ackData', {
        id,
        charCount,
        ...(typeof processedChars === 'number' ? { processedChars } : {})
      })
    },
    /** Main asks for the renderer's cumulative processed totals when terminal
     *  delivery looks stuck on lost ACKs. */
    onDeliveryResyncRequest: (callback: (payload: { requestId: number }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: { requestId: number }) =>
        callback(payload)
      ipcRenderer.on('pty:requestDeliveryResync', listener)
      return () => ipcRenderer.removeListener('pty:requestDeliveryResync', listener)
    },
    respondDeliveryResync: (payload: {
      requestId: number
      processedCharsByPty: Record<string, number>
    }): void => {
      ipcRenderer.send('pty:deliveryResyncResponse', payload)
    },
    /** Renderer-initiated delivery health/heal lane. Rides invoke because the
     *  field wedge (v1.4.121-rc.0 snapshot) kills main→renderer push events
     *  while invoke stays alive — push-initiated recovery can't reach it. */
    reportRendererDeliveryState: (
      report: PtyRendererDeliveryStateReport
    ): Promise<PtyRendererDeliveryHealthReply> =>
      ipcRenderer.invoke('pty:reportRendererDeliveryState', report),
    /** Sync count of live pty:data listeners on this preload's emitter — the
     *  watchdog's "listener detached" vs "channel dead" discriminator. */
    getPtyDataListenerCount: (): number => ipcRenderer.listenerCount('pty:data'),
    rendererDispatcherReady: (): void => {
      ipcRenderer.send('pty:rendererDispatcherReady')
    },
    setActiveRendererPty: (id: string, active: boolean): void => {
      ipcRenderer.send('pty:setActiveRendererPty', { id, active })
    },
    setRendererPtyVisible: (id: string, visible: boolean): void => {
      ipcRenderer.send('pty:setRendererPtyVisible', { id, visible })
    },
    /** Hidden-delivery gate (Phase 4): hidden=true lets main DROP renderer
     *  byte delivery after model ingestion; reveal restores from the model
     *  snapshot. Fire-and-forget like setActiveRendererPty. */
    setHiddenRendererPty: (id: string, hidden: boolean): void => {
      ipcRenderer.send('pty:setHiddenRendererPty', { id, hidden })
    },
    /** Delivery-interest signal: any renderer party that needs raw bytes
     *  (dispatcher sidecars, eager pre-mount buffers) suppresses the
     *  hidden-delivery gate for that PTY while registered. */
    setPtyDeliveryInterest: (id: string, interested: boolean): void => {
      ipcRenderer.send('pty:setPtyDeliveryInterest', { id, interested })
    },
    /** View-attribute bridge (Phase 5 slice 2): app-global composed terminal
     *  appearance push that lets main's model responder answer OSC 4/10/11/12
     *  and DSR ?996n for hidden-gated PTYs with renderer-true values. */
    publishTerminalViewAttributes: (attributes: TerminalViewAttributes): void => {
      ipcRenderer.send('pty:terminalViewAttributes', attributes)
    },

    kill: (id: string, opts?: { keepHistory?: boolean }): Promise<void> =>
      ipcRenderer.invoke('pty:kill', { id, keepHistory: opts?.keepHistory ?? false }),

    listSessions: (): Promise<{ id: string; cwd: string; title: string }[]> =>
      ipcRenderer.invoke('pty:listSessions'),
    getAuthoritativeBufferSnapshotCapabilities: (
      ids: string[]
    ): { id: string; authoritative: boolean | null }[] =>
      ipcRenderer.sendSync('pty:getAuthoritativeBufferSnapshotCapabilitiesSync', { ids }),
    hasPty: (id: string): Promise<boolean | null> => ipcRenderer.invoke('pty:hasPty', { id }),

    getMainBufferSnapshot: (
      id: string,
      opts?: { scrollbackRows?: number }
    ): Promise<{
      data: string
      cols: number
      rows: number
      cwd?: string | null
      seq?: number
      pendingDeliveryStartSeq?: number
      source?: 'headless' | 'renderer'
      alternateScreen?: boolean
      scrollbackAnsi?: string
      pendingEscapeTailAnsi?: string
    } | null> => ipcRenderer.invoke('pty:getMainBufferSnapshot', { id, opts }),

    getRendererDeliveryDebugSnapshot: (): Promise<{
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
    }> => ipcRenderer.invoke('pty:getRendererDeliveryDebugSnapshot'),

    /** Check if a PTY's shell has child processes (e.g. a running command).
     *  Returns false for an idle shell prompt. */
    hasChildProcesses: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('pty:hasChildProcesses', { id }),

    /** Return the PTY foreground process basename when available (e.g. "codex"). */
    getForegroundProcess: (id: string): Promise<string | null> =>
      ipcRenderer.invoke('pty:getForegroundProcess', { id }),
    confirmForegroundProcess: (id: string): Promise<string | null> =>
      ipcRenderer.invoke('pty:confirmForegroundProcess', { id }),

    /** Resolve the live cwd of a PTY via `/proc` (Linux) or `lsof` (macOS).
     *  Returns `''` when the id is unknown or the platform cannot resolve one. */
    getCwd: (id: string): Promise<string> => ipcRenderer.invoke('pty:getCwd', { id }),

    /** The PTY's last APPLIED size (its real winsize), or null if unknown.
     *  Lets the renderer detect drift after a resize was dropped main-side and
     *  re-assert, instead of trusting the size it last fired blind. */
    getSize: (id: string): Promise<{ cols: number; rows: number } | null> =>
      ipcRenderer.invoke('pty:getSize', { id }),

    onData: (
      callback: (data: {
        id: string
        data: string
        seq?: number
        rawLength?: number
        background?: boolean
        droppedOutput?: boolean
      }) => void
    ): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: {
          id: string
          data: string
          seq?: number
          rawLength?: number
          background?: boolean
          droppedOutput?: boolean
        }
      ) => callback(data)
      ipcRenderer.on('pty:data', listener)
      return () => ipcRenderer.removeListener('pty:data', listener)
    },

    onReplay: (callback: (data: { id: string; data: string }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { id: string; data: string }) =>
        callback(data)
      ipcRenderer.on('pty:replay', listener)
      return () => ipcRenderer.removeListener('pty:replay', listener)
    },

    /** Out-of-band signal that main dropped renderer-bound bytes for a PTY
     *  (hidden-delivery gate / pending cap) — the pane must restore from the
     *  model snapshot. Deliberately NOT on pty:data: an in-band marker is
     *  ambiguous with chunks fully stripped by OSC-9999 cleaning. */
    onModelRestoreNeeded: (callback: (event: PtyModelRestoreNeededEvent) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, event: PtyModelRestoreNeededEvent) =>
        callback(event)
      ipcRenderer.on('pty:modelRestoreNeeded', listener)
      return () => ipcRenderer.removeListener('pty:modelRestoreNeeded', listener)
    },

    /** Batched derived side-effect facts (title/bell/agent transitions) for
     *  PTYs whose bytes transit local main. Per-PTY in-order; deliberately not
     *  synchronized with pty:data (terminal-side-effect-authority.md). */
    onSideEffect: (callback: (batch: TerminalSideEffectBatch) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, batch: TerminalSideEffectBatch) =>
        callback(batch)
      ipcRenderer.on('pty:sideEffect', listener)
      return () => ipcRenderer.removeListener('pty:sideEffect', listener)
    },

    /** Title-only replay snapshot applied on (re)attach — attention facts
     *  (bells/completions) never replay. */
    getSideEffectSnapshot: (id: string): Promise<TerminalSideEffectBatch | null> =>
      ipcRenderer.invoke('pty:sideEffectSnapshot', { id }),

    onExit: (callback: (data: { id: string; code: number }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { id: string; code: number }) =>
        callback(data)
      ipcRenderer.on('pty:exit', listener)
      return () => ipcRenderer.removeListener('pty:exit', listener)
    },

    onClearBufferRequest: (callback: (data: { ptyId: string }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { ptyId: string }) =>
        callback(data)
      ipcRenderer.on('pty:clearBuffer:request', listener)
      return () => ipcRenderer.removeListener('pty:clearBuffer:request', listener)
    },

    // Why: pre-signal handshake — renderer declares it will own the serializer
    // for `paneKey` BEFORE issuing pty:spawn so the cooperation gate in main
    // can suppress the daemon-snapshot seed. Returns a generation token that
    // the renderer must echo on settle/clear so paneKey-reuse during teardown
    // cannot defeat the pre-signal. See docs/mobile-prefer-renderer-scrollback.md.
    declarePendingPaneSerializer: (paneKey: string): Promise<number> =>
      ipcRenderer.invoke('pty:declarePendingPaneSerializer', { paneKey }),

    settlePaneSerializer: (paneKey: string, gen: number): Promise<void> =>
      ipcRenderer.invoke('pty:settlePaneSerializer', { paneKey, gen }),

    clearPendingPaneSerializer: (paneKey: string, gen: number): Promise<void> =>
      ipcRenderer.invoke('pty:clearPendingPaneSerializer', { paneKey, gen }),

    reportRendererSerializerReady: (ptyId: string): Promise<void> =>
      ipcRenderer.invoke('pty:reportRendererSerializerReady', { ptyId })
  },

  feedback: {
    submit: (args: {
      feedback: string
      submitAnonymously?: boolean
      githubLogin: string | null
      githubEmail: string | null
    }): Promise<{ ok: true } | { ok: false; status: number | null; error: string }> =>
      ipcRenderer.invoke('feedback:submit', args)
  },

  crashReports: {
    getLatestPending: () => ipcRenderer.invoke('crashReports:getLatestPending'),
    getLatestReport: () => ipcRenderer.invoke('crashReports:getLatestReport'),
    dismiss: (args: { reportId: string }) => ipcRenderer.invoke('crashReports:dismiss', args),
    recordRendererError: (
      args: ReactErrorBoundaryReportArgs
    ): Promise<ReactErrorBoundaryReportResult> =>
      ipcRenderer.invoke('crashReports:recordRendererError', args),
    recordBreadcrumb: (args: { name: string; data?: CrashReportBreadcrumbData }): void =>
      ipcRenderer.send('crashReports:recordBreadcrumb', args),
    submit: (args: CrashReportSubmitArgs): Promise<CrashReportSubmitResult> =>
      ipcRenderer.invoke('crashReports:submit', args),
    copyLatestDiagnostics: (args?: CrashReportCopyDiagnosticsArgs) =>
      ipcRenderer.invoke('crashReports:copyLatestDiagnostics', args)
  },

  export: {
    htmlToPdf: (args: {
      html: string
      title: string
    }): Promise<
      { success: true; filePath: string } | { success: false; cancelled?: boolean; error?: string }
    > => ipcRenderer.invoke('export:html-to-pdf', args)
  },

  gh: {
    viewer: (): Promise<unknown> => ipcRenderer.invoke('gh:viewer'),
    enqueuePRRefresh: (args: {
      candidate: GitHubPRRefreshCandidate
      reason: GitHubPRRefreshReason
      priority?: number
    }): Promise<unknown> => ipcRenderer.invoke('gh:enqueuePRRefresh', args),

    reportVisiblePRRefreshCandidates: (args: {
      candidates: GitHubPRRefreshCandidate[]
      generation: number
    }): Promise<unknown> => ipcRenderer.invoke('gh:reportVisiblePRRefreshCandidates', args),
    checkYiruStarred: (): Promise<boolean | null> => ipcRenderer.invoke('gh:checkYiruStarred'),
    starYiru: (source: AppStarSource): Promise<boolean> => ipcRenderer.invoke('gh:starYiru', source)
  },

  starNag: {
    onShow: (
      callback: (payload?: { mode?: 'gh' | 'web'; surface?: 'card' | 'toast' }) => void
    ): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        payload?: { mode?: 'gh' | 'web'; surface?: 'card' | 'toast' }
      ): void => callback(payload)
      ipcRenderer.on('star-nag:show', listener)
      return () => ipcRenderer.removeListener('star-nag:show', listener)
    },
    onHide: (callback: () => void): (() => void) => {
      const listener = (): void => callback()
      ipcRenderer.on('star-nag:hide', listener)
      return () => ipcRenderer.removeListener('star-nag:hide', listener)
    },
    dismiss: (): Promise<void> => ipcRenderer.invoke('star-nag:dismiss'),
    later: (): Promise<void> => ipcRenderer.invoke('star-nag:later'),
    complete: (): Promise<void> => ipcRenderer.invoke('star-nag:complete'),
    disable: (): Promise<void> => ipcRenderer.invoke('star-nag:disable'),
    openWeb: (): Promise<void> => ipcRenderer.invoke('star-nag:openWeb'),
    starYiru: (): Promise<boolean> => ipcRenderer.invoke('star-nag:starYiru'),
    forceShow: (): Promise<void> => ipcRenderer.invoke('star-nag:forceShow'),
    agentValueMoment: (): Promise<
      { status: 'ready'; mode: 'gh' | 'web' } | { status: 'skipped' }
    > => ipcRenderer.invoke('star-nag:agentValueMoment'),
    showAgentValueMoment: (): Promise<void> => ipcRenderer.invoke('star-nag:showAgentValueMoment'),
    onboardingCompleted: (): Promise<void> => ipcRenderer.invoke('star-nag:onboardingCompleted')
  },

  // Why: telemetry uses a loose untyped surface at the preload boundary on
  // purpose — the main-side validator (src/main/telemetry/validator.ts) is
  // the single enforcement point, not the preload types. The renderer gets
  // typed `track<N>()` / `setOptIn()` wrappers via
  // packages/client/src/lib/telemetry.ts, which is what call sites import.
  telemetryTrack: (name: string, props: Record<string, unknown>): Promise<void> =>
    ipcRenderer.invoke('telemetry:track', name, props),
  telemetrySetOptIn: (optedIn: boolean): Promise<void> =>
    ipcRenderer.invoke('telemetry:setOptIn', optedIn),
  telemetryAcknowledgeBanner: (): Promise<void> =>
    ipcRenderer.invoke('telemetry:acknowledgeBanner'),
  telemetryGetConsentState: (): Promise<TelemetryConsentState> =>
    ipcRenderer.invoke('telemetry:getConsentState'),

  // Why: diagnostics is the renderer-facing surface for the error-tracking
  // lane (telemetry-error-tracking.md §User controls). Handlers type-narrow
  // their inputs in main (renderer is untrusted by design); the bridges here
  // are deliberately loose for the same reason the telemetry bridges are.
  diagnostics: {
    getStatus: (): Promise<unknown> => ipcRenderer.invoke('diagnostics:getStatus'),
    collectBundle: (lookbackMinutes?: number): Promise<unknown> =>
      ipcRenderer.invoke('diagnostics:collectBundle', lookbackMinutes),
    openBundlePreview: (bundleSubmissionId: string): Promise<void> =>
      ipcRenderer.invoke('diagnostics:openBundlePreview', bundleSubmissionId),
    discardBundlePreview: (bundleSubmissionId: string): Promise<void> =>
      ipcRenderer.invoke('diagnostics:discardBundlePreview', bundleSubmissionId),
    uploadBundle: (bundleSubmissionId: string): Promise<unknown> =>
      ipcRenderer.invoke('diagnostics:uploadBundle', bundleSubmissionId)
  },

  settings: {
    get: (): Promise<unknown> => ipcRenderer.invoke('settings:get'),

    // Why: blocking read for the few startup decisions (terminal side-effect
    // authority) that cannot wait for async hydration. Call sparingly.
    getSync: (): unknown => ipcRenderer.sendSync('settings:get-sync'),

    set: (args: Record<string, unknown>): Promise<unknown> =>
      ipcRenderer.invoke('settings:set', args),

    updatePRBotAuthorOverride: (args: { author: string; isBot: boolean }): Promise<unknown> =>
      ipcRenderer.invoke('settings:update-pr-bot-author-override', args)
  },

  localhostWorktreeLabels: {
    register: (args: LocalhostWorktreeLabelRoute): Promise<LocalhostWorktreeLabelResult> =>
      ipcRenderer.invoke('localhostWorktreeLabels:register', args)
  } satisfies PreloadApi['localhostWorktreeLabels'],

  keybindings: {
    get: (): Promise<KeybindingFileSnapshot> => ipcRenderer.invoke('keybindings:get'),
    ensureFile: (): Promise<KeybindingFileSnapshot> => ipcRenderer.invoke('keybindings:ensureFile'),
    setAction: (args: {
      actionId: KeybindingActionId
      bindings: string[] | null
    }): Promise<KeybindingFileSnapshot> => ipcRenderer.invoke('keybindings:setAction', args),
    reload: (): Promise<KeybindingFileSnapshot> => ipcRenderer.invoke('keybindings:reload'),
    openFile: (): Promise<KeybindingFileSnapshot> => ipcRenderer.invoke('keybindings:openFile'),
    revealFile: (): Promise<KeybindingFileSnapshot> => ipcRenderer.invoke('keybindings:revealFile'),
    onChanged: (callback: (snapshot: KeybindingFileSnapshot) => void): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        snapshot: KeybindingFileSnapshot
      ): void => callback(snapshot)
      ipcRenderer.on('keybindings:changed', listener)
      return () => ipcRenderer.removeListener('keybindings:changed', listener)
    }
  },

  codexAccounts: {
    list: (): Promise<unknown> => ipcRenderer.invoke('codexAccounts:list'),
    add: (args?: { runtime?: 'host' | 'wsl'; wslDistro?: string | null }): Promise<unknown> =>
      ipcRenderer.invoke('codexAccounts:add', args),
    reauthenticate: (args: { accountId: string }): Promise<unknown> =>
      ipcRenderer.invoke('codexAccounts:reauthenticate', args)
  },

  claudeAccounts: {
    list: (): Promise<unknown> => ipcRenderer.invoke('claudeAccounts:list'),
    add: (args?: { runtime?: 'host' | 'wsl'; wslDistro?: string | null }): Promise<unknown> =>
      ipcRenderer.invoke('claudeAccounts:add', args),
    cancelPendingLogin: (): Promise<boolean> =>
      ipcRenderer.invoke('claudeAccounts:cancelPendingLogin'),
    reauthenticate: (args: { accountId: string }): Promise<unknown> =>
      ipcRenderer.invoke('claudeAccounts:reauthenticate', args)
  },

  agentTrust: {
    markTrusted: (args: {
      preset: 'cursor' | 'copilot' | 'codex'
      workspacePath: string
    }): Promise<void> => ipcRenderer.invoke('agentTrust:markTrusted', args)
  },

  notifications: {
    displayNative: (
      args: ShellServicesNotificationsDisplayInput
    ): Promise<ShellServicesNotificationsDisplayOutput> =>
      ipcRenderer.invoke('notifications:displayNative', args),
    dismissNative: (notificationIds: string[]): Promise<ShellServicesNotificationsDismissOutput> =>
      ipcRenderer.invoke('notifications:dismissNative', notificationIds),
    openSystemSettings: (): Promise<void> => ipcRenderer.invoke('notifications:openSystemSettings'),
    getPermissionStatus: (): Promise<NotificationPermissionStatusResult> =>
      ipcRenderer.invoke('notifications:getPermissionStatus'),
    probeDelivery: (args?: { force?: boolean }): Promise<NotificationDeliveryProbeResult> =>
      ipcRenderer.invoke('notifications:probeDelivery', args),
    playSound: async (options?: {
      force?: boolean
      volume?: number
    }): Promise<NotificationSoundResult> => {
      try {
        // Why: drop replays while the sound is still ringing. The "test"
        // button bypasses with force so the user always hears a confirmation.
        if (!options?.force && isNotificationSoundPlaying) {
          return { played: false, reason: 'deduped' }
        }

        const resolved = (await ipcRenderer.invoke(
          'notifications:resolveSoundPath'
        )) as NotificationSoundPathResult
        if (!resolved.ok) {
          if (cachedNotificationSound) {
            disposeCachedNotificationSound()
          }
          return { played: false, reason: resolved.reason }
        }

        let entry = cachedNotificationSound
        if (!entry || entry.path !== resolved.path) {
          const sound = (await ipcRenderer.invoke(
            'notifications:loadSound'
          )) as NotificationSoundDataResult
          if (!sound.ok) {
            disposeCachedNotificationSound()
            return { played: false, reason: sound.reason }
          }
          const arrayBuffer = new ArrayBuffer(sound.data.byteLength)
          new Uint8Array(arrayBuffer).set(sound.data)
          const blob = new Blob([arrayBuffer], { type: sound.mimeType })
          disposeCachedNotificationSound()
          const blobUrl = URL.createObjectURL(blob)
          entry = { path: sound.path, blobUrl, audio: new Audio(blobUrl) }
          cachedNotificationSound = entry
        }

        const audio = entry.audio
        // Why: restart-from-zero on every play so a burst of triggers replays
        // the sound from the start instead of stacking overlapping copies.
        // Matches GNOME canberra and VS Code AccessibilitySignalService.
        audio.currentTime = 0
        if (typeof options?.volume === 'number' && Number.isFinite(options.volume)) {
          audio.volume = Math.min(1, Math.max(0, options.volume / 100))
        }
        isNotificationSoundPlaying = true
        cleanupNotificationSoundPlayback?.()
        const release = (): void => {
          cleanup()
          if (cleanupNotificationSoundPlayback === cleanup) {
            cleanupNotificationSoundPlayback = null
          }
          isNotificationSoundPlaying = false
        }
        const cleanup = (): void => {
          audio.removeEventListener('ended', release)
          audio.removeEventListener('error', release)
        }
        cleanupNotificationSoundPlayback = cleanup
        audio.addEventListener('ended', release)
        audio.addEventListener('error', release)
        try {
          await audio.play()
        } catch {
          release()
          return { played: false, reason: 'playback-failed' }
        }
        return { played: true }
      } catch {
        clearNotificationSoundPlaybackState()
        return { played: false, reason: 'playback-failed' }
      }
    }
  },

  onboarding: {
    get: (): Promise<OnboardingState> => ipcRenderer.invoke('onboarding:get'),
    update: (
      updates: Partial<Omit<OnboardingState, 'checklist'>> & {
        checklist?: Partial<OnboardingState['checklist']>
      }
    ): Promise<OnboardingState> => ipcRenderer.invoke('onboarding:update', updates)
  },

  developerPermissions: {
    getStatus: (): Promise<unknown> => ipcRenderer.invoke('developerPermissions:getStatus'),
    request: (args: { id: string }): Promise<unknown> =>
      ipcRenderer.invoke('developerPermissions:request', args)
  },

  pet: {
    import: (): Promise<CustomPet | null> => ipcRenderer.invoke('pet:import'),
    importPetBundle: (): Promise<CustomPet | null> => ipcRenderer.invoke('pet:importPetBundle'),
    read: (id: string, fileName: string, kind?: 'image' | 'bundle'): Promise<ArrayBuffer | null> =>
      ipcRenderer.invoke('pet:read', id, fileName, kind),
    delete: (id: string, fileName: string, kind?: 'image' | 'bundle'): Promise<void> =>
      ipcRenderer.invoke('pet:delete', id, fileName, kind)
  },

  emulator: {
    startFrameStream: (args: {
      streamUrl: string
      streamKey?: string
    }): Promise<{
      streamId: string
    }> => ipcRenderer.invoke('emulator:frameStreamStart', args),
    stopFrameStream: (args: { streamId: string }): Promise<void> =>
      ipcRenderer.invoke('emulator:frameStreamStop', args),
    onFrameStreamFrame: (
      callback: (data: { streamId: string; bytes: ArrayBuffer }) => void
    ): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { streamId: string; bytes: ArrayBuffer }
      ) => callback(data)
      ipcRenderer.on('emulator:frameStreamFrame', listener)
      return () => ipcRenderer.removeListener('emulator:frameStreamFrame', listener)
    },
    onFrameStreamError: (
      callback: (data: { streamId: string; message: string }) => void
    ): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: { streamId: string; message: string }
      ) => callback(data)
      ipcRenderer.on('emulator:frameStreamError', listener)
      return () => ipcRenderer.removeListener('emulator:frameStreamError', listener)
    },
    startVideoStream: (args: {
      deviceId: string
      streamId: string
    }): Promise<{ streamId: string }> => ipcRenderer.invoke('emulator:videoStreamStart', args),
    stopVideoStream: (args: { streamId: string }): Promise<void> =>
      ipcRenderer.invoke('emulator:videoStreamStop', args),
    onVideoStreamMeta: (
      callback: (data: {
        streamId: string
        deviceId: string
        meta: { codecId: string; width: number; height: number }
      }) => void
    ): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: {
          streamId: string
          deviceId: string
          meta: { codecId: string; width: number; height: number }
        }
      ) => callback(data)
      ipcRenderer.on('emulator:videoStreamMeta', listener)
      return () => ipcRenderer.removeListener('emulator:videoStreamMeta', listener)
    },
    onVideoStreamFrame: (
      callback: (data: {
        streamId: string
        deviceId: string
        config: boolean
        keyFrame: boolean
        bytes: ArrayBuffer
      }) => void
    ): (() => void) => {
      const listener = (
        _event: Electron.IpcRendererEvent,
        data: {
          streamId: string
          deviceId: string
          config: boolean
          keyFrame: boolean
          bytes: ArrayBuffer
        }
      ) => callback(data)
      ipcRenderer.on('emulator:videoStreamFrame', listener)
      return () => ipcRenderer.removeListener('emulator:videoStreamFrame', listener)
    }
  },

  cache: {
    getGitHub: () => ipcRenderer.invoke('cache:getGitHub'),
    setGitHub: (args) => ipcRenderer.invoke('cache:setGitHub', args)
  } satisfies PreloadApi['cache'],

  session: {
    // hostId is optional and defaults to 'local' on the main side, so existing
    // call sites that omit it keep targeting the local session partition.
    get: (hostId) => ipcRenderer.invoke('session:get', hostId),
    set: (args, hostId) => ipcRenderer.invoke('session:set', args, hostId),
    patch: (args, hostId) => ipcRenderer.invoke('session:patch', args, hostId),
    flush: () => ipcRenderer.invoke('session:flush'),
    readTerminalScrollback: (args) =>
      ipcRenderer.sendSync('session:read-terminal-scrollback-sync', args),
    /** Synchronous session save for beforeunload — blocks until flushed to disk. */
    setSync: (args, hostId) => {
      ipcRenderer.sendSync('session:set-sync', args, hostId)
    }
  } satisfies PreloadApi['session'],

  updater: {
    getStatus: () => ipcRenderer.invoke('updater:getStatus'),
    getVersion: () => ipcRenderer.invoke('updater:getVersion'),
    check: (options) => ipcRenderer.invoke('updater:check', options),
    download: () => ipcRenderer.invoke('updater:download'),
    dismissNudge: () => ipcRenderer.invoke('updater:dismissNudge'),
    quitAndInstall: async (): Promise<void> => {
      await prepareRendererForAppRestart({
        startedEventName: YIRU_UPDATER_QUIT_AND_INSTALL_STARTED_EVENT,
        abortedEventName: YIRU_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT
      })
      try {
        return await ipcRenderer.invoke('updater:quitAndInstall')
      } catch (error) {
        window.dispatchEvent(new Event(YIRU_UPDATER_QUIT_AND_INSTALL_ABORTED_EVENT))
        throw error
      }
    },
    onStatus: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status)
      ipcRenderer.on('updater:status', listener)
      return () => ipcRenderer.removeListener('updater:status', listener)
    },
    onClearDismissal: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent) => callback()
      ipcRenderer.on('updater:clearDismissal', listener)
      return () => ipcRenderer.removeListener('updater:clearDismissal', listener)
    }
  } satisfies PreloadApi['updater'],

  ui: {
    get: () => ipcRenderer.invoke('ui:get'),
    set: (args) => ipcRenderer.invoke('ui:set', args),
    recordFeatureInteraction: (id) => ipcRenderer.invoke('ui:recordFeatureInteraction', id)
  } satisfies PreloadApi['ui'],

  claudeUsage: {
    getScanState: (): Promise<unknown> => ipcRenderer.invoke('claudeUsage:getScanState'),
    setEnabled: (args: { enabled: boolean }): Promise<unknown> =>
      ipcRenderer.invoke('claudeUsage:setEnabled', args),
    refresh: (args?: { force?: boolean }): Promise<unknown> =>
      ipcRenderer.invoke('claudeUsage:refresh', args),
    getSnapshot: (args: { scope: string; range: string; limit?: number }): Promise<unknown> =>
      ipcRenderer.invoke('claudeUsage:getSnapshot', args),
    getSummary: (args: { scope: string; range: string }): Promise<unknown> =>
      ipcRenderer.invoke('claudeUsage:getSummary', args),
    getDaily: (args: { scope: string; range: string }): Promise<unknown> =>
      ipcRenderer.invoke('claudeUsage:getDaily', args),
    getBreakdown: (args: { scope: string; range: string; kind: string }): Promise<unknown> =>
      ipcRenderer.invoke('claudeUsage:getBreakdown', args),
    getRecentSessions: (args: { scope: string; range: string; limit?: number }): Promise<unknown> =>
      ipcRenderer.invoke('claudeUsage:getRecentSessions', args)
  },

  codexUsage: {
    getScanState: (): Promise<unknown> => ipcRenderer.invoke('codexUsage:getScanState'),
    setEnabled: (args: { enabled: boolean }): Promise<unknown> =>
      ipcRenderer.invoke('codexUsage:setEnabled', args),
    refresh: (args?: { force?: boolean }): Promise<unknown> =>
      ipcRenderer.invoke('codexUsage:refresh', args),
    getSnapshot: (args: { scope: string; range: string; limit?: number }): Promise<unknown> =>
      ipcRenderer.invoke('codexUsage:getSnapshot', args),
    getSummary: (args: { scope: string; range: string }): Promise<unknown> =>
      ipcRenderer.invoke('codexUsage:getSummary', args),
    getDaily: (args: { scope: string; range: string }): Promise<unknown> =>
      ipcRenderer.invoke('codexUsage:getDaily', args),
    getBreakdown: (args: { scope: string; range: string; kind: string }): Promise<unknown> =>
      ipcRenderer.invoke('codexUsage:getBreakdown', args),
    getRecentSessions: (args: { scope: string; range: string; limit?: number }): Promise<unknown> =>
      ipcRenderer.invoke('codexUsage:getRecentSessions', args)
  },

  openCodeUsage: {
    getScanState: (): Promise<unknown> => ipcRenderer.invoke('openCodeUsage:getScanState'),
    setEnabled: (args: { enabled: boolean }): Promise<unknown> =>
      ipcRenderer.invoke('openCodeUsage:setEnabled', args),
    refresh: (args?: { force?: boolean }): Promise<unknown> =>
      ipcRenderer.invoke('openCodeUsage:refresh', args),
    getSnapshot: (args: { scope: string; range: string; limit?: number }): Promise<unknown> =>
      ipcRenderer.invoke('openCodeUsage:getSnapshot', args),
    getSummary: (args: { scope: string; range: string }): Promise<unknown> =>
      ipcRenderer.invoke('openCodeUsage:getSummary', args),
    getDaily: (args: { scope: string; range: string }): Promise<unknown> =>
      ipcRenderer.invoke('openCodeUsage:getDaily', args),
    getBreakdown: (args: { scope: string; range: string; kind: string }): Promise<unknown> =>
      ipcRenderer.invoke('openCodeUsage:getBreakdown', args),
    getRecentSessions: (args: { scope: string; range: string; limit?: number }): Promise<unknown> =>
      ipcRenderer.invoke('openCodeUsage:getRecentSessions', args)
  },

  aiVault: {
    listSessions: (args?: AiVaultListArgs): Promise<unknown> =>
      ipcRenderer.invoke('aiVault:listSessions', args),
    listSubagentSessions: (args: AiVaultSubagentListArgs): Promise<unknown> =>
      ipcRenderer.invoke('aiVault:listSubagentSessions', args),
    onWindowFocused: (callback: () => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent) => callback()
      ipcRenderer.on('aiVault:windowFocused', listener)
      return () => ipcRenderer.removeListener('aiVault:windowFocused', listener)
    }
  },

  friday: {
    getOrCreate: (): Promise<FridaySession> => ipcRenderer.invoke('friday:getOrCreate'),
    restart: (): Promise<FridaySession> => ipcRenderer.invoke('friday:restart')
  },

  runtime: {
    syncWindowGraph: (graph: RuntimeSyncWindowGraph): Promise<RuntimeSyncWindowGraphResult> =>
      ipcRenderer.invoke('runtime:syncWindowGraph', graph),
    getTerminalFitOverrides: (): Promise<
      { ptyId: string; mode: 'mobile-fit' | 'remote-desktop-fit'; cols: number; rows: number }[]
    > => ipcRenderer.invoke('runtime:getTerminalFitOverrides'),
    getTerminalDrivers: (): Promise<
      {
        ptyId: string
        driver: RuntimeTerminalDriverState
      }[]
    > => ipcRenderer.invoke('runtime:getTerminalDrivers'),
    getBrowserDrivers: (): Promise<
      {
        browserPageId: string
        driver: RuntimeBrowserDriverState
      }[]
    > => ipcRenderer.invoke('runtime:getBrowserDrivers'),
    restoreTerminalFit: (ptyId: string): Promise<{ restored: boolean }> =>
      ipcRenderer.invoke('runtime:restoreTerminalFit', { ptyId }),
    reclaimBrowserForDesktop: (browserPageId: string): Promise<{ reclaimed: boolean }> =>
      ipcRenderer.invoke('runtime:reclaimBrowserForDesktop', { browserPageId })
  },

  runtimeEnvironments: {
    list: (): Promise<PublicKnownRuntimeEnvironment[]> =>
      ipcRenderer.invoke('runtimeEnvironments:list'),
    resolve: (args: { selector: string }): Promise<PublicKnownRuntimeEnvironment> =>
      ipcRenderer.invoke('runtimeEnvironments:resolve', args),
    remove: (args: { selector: string }): Promise<{ removed: PublicKnownRuntimeEnvironment }> =>
      ipcRenderer.invoke('runtimeEnvironments:remove', args),
    disconnect: (args: {
      selector: string
    }): Promise<{ disconnected: PublicKnownRuntimeEnvironment }> =>
      ipcRenderer.invoke('runtimeEnvironments:disconnect', args),
    getStatus: (args: {
      selector: string
      timeoutMs?: number
    }): Promise<RuntimeRpcResponse<RuntimeStatus>> =>
      ipcRenderer.invoke('runtimeEnvironments:getStatus', args),
    call: (args: {
      selector: string
      method: string
      params?: unknown
      timeoutMs?: number
    }): Promise<RuntimeRpcResponse<unknown>> =>
      ipcRenderer.invoke('runtimeEnvironments:call', args),
    subscribe: async (
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
    ): Promise<RuntimeEnvironmentSubscriptionHandle> =>
      subscribeRuntimeEnvironmentFromPreload(ipcRenderer, args, callbacks),
    // Why: desktop's environment oRPC already has a working path — the
    // MessagePort tunnel `orpc-environment-client.ts` opens through main. This
    // member exists only so the web preload shim can route shared renderer
    // code to its own negotiated peer; it is never reached here.
    callOrpcProcedure: (): Promise<unknown> =>
      Promise.reject(new Error('callOrpcProcedure is only available in the paired web client.'))
  },

  minimaxCredentials: {
    getStatus: (): Promise<{ configured: boolean }> =>
      ipcRenderer.invoke('minimaxCredentials:getStatus'),
    saveCookie: (cookie: string): Promise<{ configured: boolean }> =>
      ipcRenderer.invoke('minimaxCredentials:saveCookie', cookie),
    clearCookie: (): Promise<{ configured: boolean }> =>
      ipcRenderer.invoke('minimaxCredentials:clearCookie')
  },

  // Why: list/listRuns/create/update/delete/runNow/listExternalManagers/
  // listExternalRuns/createExternal/updateExternal/runExternalAction/
  // snapshotWorkspaceName moved to the `automation.*` oRPC contract —
  // renderer call sites now go through `callRuntimeOrpc` (see
  // `renderer/components/automations/automation-host-client.ts`) for every
  // host target, local included, instead of this preload bridge. The three
  // members left below are local-dispatch machinery with no host-target
  // concept: see the matching `Why:` on this group in `api-types.ts`.
  automations: {
    runPrecheck: (args: {
      automationId: string
      runId: string
    }): Promise<AutomationPrecheckResult | null> =>
      ipcRenderer.invoke('automations:runPrecheck', args),
    markDispatchResult: (result: AutomationDispatchResult): Promise<AutomationRun> =>
      ipcRenderer.invoke('automations:markDispatchResult', result),
    rendererReady: (): Promise<void> => ipcRenderer.invoke('automations:rendererReady')
  },

  // shell-only: listNetworkInterfaces/getPairingQR/listDevices/revokeDevice/
  // isWebSocketReady moved to the `mobile.*` oRPC contract
  // (mobile-host-pairing.ts) — they describe a runtime host's own reachable
  // addresses and device registry, not this shell. The three members left
  // here inspect/repair the Windows Defender Firewall on the machine running
  // this Electron shell, an OS-level operation with no runtime-host meaning.
  mobile: {
    getWindowsFirewallStatus: (args?: { address?: string }) =>
      ipcRenderer.invoke('mobile:getWindowsFirewallStatus', args),

    repairWindowsFirewall: () => ipcRenderer.invoke('mobile:repairWindowsFirewall'),

    openWindowsNetworkSettings: () => ipcRenderer.invoke('mobile:openWindowsNetworkSettings')
  },

  speech: {
    ensureMicrophoneAccess: (): Promise<void> => ipcRenderer.invoke('speech:ensureMicrophoneAccess')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
