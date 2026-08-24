import { type BrowserWindow, type WebContents, app } from 'electron'
import {
  resolveTerminalStartupCwdForWorkspace,
  type TerminalStartupCwdMissingDirFallback
} from '~shared/terminal/startup-cwd'
import type { GlobalSettings } from '~shared/types'
import { parseWorkspaceKey } from '~shared/workspace/scope'

import { isAgentStatusHooksEnabled } from '../agent-hooks/managed-agent-hook-controls'
import { markClaudePtyExited } from '../claude/accounts/live-pty-gate'
import type { CodexAccountSelectionTarget } from '../codex/accounts/runtime-selection'
import type { Store } from '../persistence'
import {
  assertFolderWorkspacePathUsable,
  getFolderWorkspacePathStatus
} from '../project-groups/folder-workspace-path-status'
import { LocalPtyProvider } from '../providers/local-pty-provider'
import type { IPtyProvider } from '../providers/types'
import { isPwshAvailable } from '../pwsh'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import { buildPtyHostEnv } from './host-env'
import type { GetSelectedCodexHomePath, PrepareClaudeAuth } from './host-env-values'
import {
  shouldStripInheritedYiruCodexHome,
  getCompatibleSelectedCodexHomePath
} from './host-env-values'
import { providerSnapshotRequiredPtys } from './provider-lifecycle'
import { clearProviderPtyState, getLocalPtyProvider } from './provider-registry'
import { createRuntimePtyController } from './runtime-controller'
import { spawnRuntimePty } from './runtime-spawn-result'
import { ptyOwnership, trustedTerminalHandleEnv } from './runtime-state'
import { addYiruWslInteropEnv } from './wsl-yiru-env'

let localDataUnsub: (() => void) | null = null
let localExitUnsub: (() => void) | null = null
let localBackgroundStreamUnsub: (() => void) | null = null
let didFinishLoadHandler: (() => void) | null = null
let didFinishLoadWebContents: WebContents | null = null
// Why: the "Restart daemon" path needs to re-bind provider→renderer listeners
// against the freshly-created adapter after replaceDaemonProvider swaps the
// module-level `localProvider` pointer. Without this, old subscribers stay
// bound to the disposed adapter and new PTY data silently drops. Saved at
// module scope so the restart flow (src/main/daemon/init.ts) can
// trigger a rebind without re-running the full registerPtyHandlers setup.
let rebindProviderListeners: (() => void) | null = null

export function rebindLocalProviderListeners(): void {
  rebindProviderListeners?.()
}

function clearDidFinishLoadHandler(): void {
  if (didFinishLoadHandler && didFinishLoadWebContents) {
    didFinishLoadWebContents.removeListener('did-finish-load', didFinishLoadHandler)
  }
  didFinishLoadHandler = null
  didFinishLoadWebContents = null
}

// Why: the "Restart daemon" flow needs to detach listeners from the current
// adapter *after* synthetic pty:exit events fan out (so the renderer receives
// them) but *before* replaceDaemonProvider swaps in the new adapter (so the
// new provider isn't missing bindings). This export narrows that window to
// the caller.
export function unbindLocalProviderListeners(): void {
  localDataUnsub?.()
  localExitUnsub?.()
  localBackgroundStreamUnsub?.()
  localDataUnsub = null
  localExitUnsub = null
  localBackgroundStreamUnsub = null
}

// ─── IPC Registration ───────────────────────────────────────────────

export function registerPtyHandlers(
  mainWindow: BrowserWindow,
  runtime?: YiruRuntimeService,
  getSelectedCodexHomePath?: GetSelectedCodexHomePath,
  getSettings?: () => GlobalSettings,
  prepareClaudeAuth?: PrepareClaudeAuth,
  store?: Store,
  options?: {
    awaitLocalPtyStartup?: () => Promise<void>
    // Why: returns true (once, consuming the flag) for the crash-recovery reload
    // so its did-finish-load skips the orphan sweep and keeps live PTYs (#5787).
    isRecoveryReloadInFlight?: (webContentsId: number) => boolean
  }
): void {
  const getLocalPtyStartupPromise = (connectionId?: string | null): Promise<void> | undefined => {
    if (connectionId) {
      return undefined
    }
    // Why: during desktop cold start the daemon provider swap now overlaps
    // first paint. Local spawns must wait before resolving getProvider(), while
    // SSH/headless paths do not use the desktop daemon.
    return options?.awaitLocalPtyStartup?.()
  }

  // Configure the local provider with app-specific hooks.
  // Why: only LocalPtyProvider has the configure() method — daemon-backed
  // providers handle subprocess spawning internally and don't need main-process
  // hook injection. The hooks (buildSpawnEnv, onSpawned, etc.) only make sense
  // when the PTY lives in the Electron main process.
  const configuredProvider = getLocalPtyProvider()
  if (configuredProvider instanceof LocalPtyProvider) {
    configuredProvider.configure({
      isHistoryEnabled: () => getSettings?.()?.terminalScopeHistoryByWorktree ?? true,
      getWindowsShell: () => getSettings?.()?.terminalWindowsShell,
      getWindowsPowerShellImplementation: () =>
        getSettings
          ? (getSettings()?.terminalWindowsPowerShellImplementation ?? 'auto')
          : undefined,
      pwshAvailable: () => isPwshAvailable(),
      buildSpawnEnv: (id, baseEnv, ctx) => {
        const codexSelectionTarget: CodexAccountSelectionTarget =
          ctx?.isWsl === true
            ? { runtime: 'wsl', wslDistro: ctx.wslDistro ?? null }
            : { runtime: 'host' }
        const selectedCodexHomePath = getCompatibleSelectedCodexHomePath(
          codexSelectionTarget,
          getSelectedCodexHomePath?.(codexSelectionTarget, baseEnv) ?? null
        )
        const skipCodexHomeEnv = ctx?.isWsl === true && !selectedCodexHomePath
        const env = buildPtyHostEnv(id, baseEnv, {
          isPackaged: app.isPackaged,
          userDataPath: app.getPath('userData'),
          selectedCodexHomePath,
          skipCodexHomeEnv,
          stripInheritedYiruCodexHome: shouldStripInheritedYiruCodexHome({
            target: codexSelectionTarget,
            selectedCodexHomePath,
            skipCodexHomeEnv
          }),
          githubAttributionEnabled: getSettings?.()?.enableGitHubAttribution ?? false,
          launchCommand: ctx?.command,
          launchAgent: ctx?.launchAgent,
          shellPath: ctx?.shellPath,
          isWsl: ctx?.isWsl,
          wslDistro: ctx?.wslDistro ?? null,
          agentStatusHooksEnabled: isAgentStatusHooksEnabled(getSettings?.()),
          networkProxySettings: getSettings?.()
        })
        // Why: agents need their own terminal handle at process start so they
        // can self-identify in orchestration messages without an extra RPC.
        const requestedHandle = baseEnv.YIRU_TERMINAL_HANDLE
        const preAllocatedHandle =
          requestedHandle && trustedTerminalHandleEnv.has(requestedHandle)
            ? requestedHandle
            : runtime?.preAllocateHandleForPty(id)
        if (requestedHandle && requestedHandle !== preAllocatedHandle) {
          delete env.YIRU_TERMINAL_HANDLE
        }
        if (preAllocatedHandle) {
          env.YIRU_TERMINAL_HANDLE = preAllocatedHandle
        }
        if (ctx?.isWsl === true) {
          addYiruWslInteropEnv(env)
        }
        return env
      },
      onSpawned: (id) => runtime?.onPtySpawned(id),
      onExit: (id, code) => {
        clearProviderPtyState(id)
        ptyOwnership.delete(id)
        markClaudePtyExited(id)
        runtime?.onPtyExit(id, code)
      }
    })
  }

  async function shutdownProviderAndDetectExit(
    provider: IPtyProvider,
    id: string,
    opts: { immediate?: boolean; keepHistory?: boolean }
  ): Promise<boolean> {
    let providerExitObserved = false
    const unsubscribe = provider.onExit((payload) => {
      if (payload.id === id) {
        providerExitObserved = true
      }
    })
    try {
      await provider.shutdown(id, opts)
    } finally {
      unsubscribe()
    }
    return providerExitObserved
  }

  // Why: extracted so the "Restart daemon" flow can rebind against the fresh
  // adapter after replaceDaemonProvider runs. Both the startup registration
  // and the post-restart rebind go through the same code path — no risk of
  // drift between the two entry points.
  const bindProviderListeners = (): void => {
    localDataUnsub?.()
    localExitUnsub?.()
    localBackgroundStreamUnsub?.()

    const provider = getLocalPtyProvider()
    const isLocalProvider = provider instanceof LocalPtyProvider
    localBackgroundStreamUnsub =
      provider.onBackgroundStreamEvent?.((payload) => {
        if (payload.kind === 'backgroundMarker') {
          runtime?.setPtyTransientFactDelegation(
            payload.id,
            payload.background,
            payload.scanSeedAnsi
          )
          return
        }
        if (payload.kind === 'dataGap') {
          providerSnapshotRequiredPtys.add(payload.id)
          runtime?.notePtyDataGap(payload.id, payload.sequenceChars ?? payload.droppedChars)
          return
        }
        runtime?.emitDaemonPtyTransientFact(payload.id, payload.fact)
      }) ?? null
    localDataUnsub = provider.onData((payload) => {
      const queryReplyOwner = runtime?.getTerminalQueryReplyOwnerForLiveChunk(payload.id) ?? 'model'
      runtime?.onPtyData(
        payload.id,
        payload.data,
        Date.now(),
        payload.sequenceChars ?? payload.data.length,
        queryReplyOwner
      )
    })
    localExitUnsub = provider.onExit((payload) => {
      if (!isLocalProvider) {
        clearProviderPtyState(payload.id)
        ptyOwnership.delete(payload.id)
        markClaudePtyExited(payload.id)
        runtime?.onPtyExit(payload.id, payload.code)
      }
    })
  }

  bindProviderListeners()
  rebindProviderListeners = bindProviderListeners

  // Kill orphaned PTY processes from previous page loads when the renderer reloads.
  // Why: only applies to LocalPtyProvider where PTYs live in the Electron main
  // process and can become orphaned on page reload. Daemon-backed sessions
  // survive renderer restarts by design — orphan cleanup would kill them.
  clearDidFinishLoadHandler()
  const rendererProvider = getLocalPtyProvider()
  if (rendererProvider instanceof LocalPtyProvider) {
    const lp = rendererProvider
    didFinishLoadHandler = () => {
      // Why: always advance so the load generation stays monotonic, but skip the
      // sweep (and its per-PTY cleanup) on the crash/freeze-recovery reload — it
      // would kill live LOCAL PTYs across the single window before session
      // restore re-attaches them (#5787). The getter consumes the flag, so the
      // next genuine reload still reclaims genuinely-orphaned PTYs.
      const generation = lp.advanceGeneration()
      if (options?.isRecoveryReloadInFlight?.(mainWindow.webContents.id)) {
        return
      }
      // Why: the retained provider onExit callback is the only physical-exit
      // proof; it clears ownership and notifies runtime after the OS reaps it.
      lp.killOrphanedPtys(generation - 1)
    }
    didFinishLoadWebContents = mainWindow.webContents
    mainWindow.webContents.on('did-finish-load', didFinishLoadHandler)
  }

  const assertFolderWorkspacePtyPathUsable = async (
    worktreeId: string | undefined
  ): Promise<void> => {
    const workspaceScope = typeof worktreeId === 'string' ? parseWorkspaceKey(worktreeId) : null
    if (!store || workspaceScope?.type !== 'folder') {
      return
    }
    const status = await getFolderWorkspacePathStatus(store, {
      scope: 'folder-workspace',
      folderWorkspaceId: workspaceScope.folderWorkspaceId
    })
    assertFolderWorkspacePathUsable(status)
  }

  const resolvePtySpawnStartupCwd = (
    worktreeId: string | undefined,
    cwd: string | undefined,
    missingDirFallback?: TerminalStartupCwdMissingDirFallback
  ): string | undefined =>
    resolveTerminalStartupCwdForWorkspace({
      workspaceId: worktreeId,
      requestedCwd: cwd,
      missingDirFallback,
      resolveFolderWorkspacePath: (folderWorkspaceId) =>
        store?.getFolderWorkspace(folderWorkspaceId)?.folderPath
    })

  // Why: the runtime controller must route through getProviderForPty() so that
  // CLI commands (terminal.send, terminal.stop) work for both local and remote PTYs.
  // Hardcoding localProvider.getPtyProcess() would silently fail for remote PTYs.
  runtime?.setPtyController(
    createRuntimePtyController({
      spawn: (args) =>
        spawnRuntimePty(args, {
          getLocalPtyStartupPromise,
          assertFolderWorkspacePtyPathUsable,
          resolvePtySpawnStartupCwd,
          runtime,
          getSelectedCodexHomePath,
          getSettings,
          prepareClaudeAuth,
          store
        }),
      runtime,
      shutdownProviderAndDetectExit
    })
  )
}

export function registerHeadlessPtyRuntime(
  runtime: YiruRuntimeService,
  getSelectedCodexHomePath?: GetSelectedCodexHomePath,
  getSettings?: () => GlobalSettings,
  prepareClaudeAuth?: PrepareClaudeAuth,
  store?: Store
): void {
  // Why: headless `yiru serve` has no renderer window, but the runtime still
  // needs the same PTY controller and provider listeners as desktop so remote
  // clients can create, stream, inspect, and stop terminals.
  const headlessWindow = {
    isDestroyed: () => true,
    webContents: {
      send: () => {},
      on: () => {},
      removeListener: () => {}
    }
  } as unknown as BrowserWindow
  registerPtyHandlers(
    headlessWindow,
    runtime,
    getSelectedCodexHomePath,
    getSettings,
    prepareClaudeAuth,
    store
  )
}
