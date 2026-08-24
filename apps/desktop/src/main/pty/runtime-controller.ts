import { parseAppSshPtyId } from '~shared/ssh-pty-id'

import type { IPtyProvider } from '../providers/types'
import type { YiruRuntimeService } from '../runtime/yiru-runtime'
import type { RuntimePtyController } from '../runtime/yiru-runtime/model/terminal-observation'
import { getLocalPtyProvider } from './provider-registry'
import {
  ptyOwnership,
  ptySizes,
  getProvider,
  getProviderForPty,
  isPtyAlreadyGoneError,
  verifyPtyStopped,
  finishPtyShutdown
} from './runtime-state'

export type RuntimePtyControllerDependencies = {
  spawn: NonNullable<RuntimePtyController['spawn']>
  runtime: YiruRuntimeService | undefined
  shutdownProviderAndDetectExit: (
    provider: IPtyProvider,
    id: string,
    opts: { immediate?: boolean; keepHistory?: boolean }
  ) => Promise<boolean>
}

export function createRuntimePtyController(
  deps: RuntimePtyControllerDependencies
): RuntimePtyController {
  const { spawn, runtime, shutdownProviderAndDetectExit } = deps
  return {
    spawn,
    write: (ptyId, data) => {
      const provider = getProviderForPty(ptyId)
      try {
        provider.write(ptyId, data)
        return true
      } catch {
        return false
      }
    },
    attach: async (ptyId) => {
      await getProviderForPty(ptyId).attach(ptyId)
    },
    kill: (ptyId) => {
      let provider: IPtyProvider
      let connectionId: string | null | undefined = ptyOwnership.get(ptyId)
      const parsedSshId = connectionId === undefined ? parseAppSshPtyId(ptyId) : null
      connectionId ??= parsedSshId?.connectionId
      try {
        provider = connectionId ? getProvider(connectionId) : getProviderForPty(ptyId)
      } catch {
        if (connectionId) {
          // Why: runtime/CLI close can target a detached SSH PTY after its
          finishPtyShutdown(ptyId)
          runtime?.onPtyExit(ptyId, -1)
          return true
        }
        return false
      }
      // Why: shutdown() is async but the PtyController interface is sync. Defer
      // cleanup until shutdown resolves so transient SSH/daemon failures don't
      // hide a still-running remote process or local daemon session.
      //
      // Same synthetic-exit contract as the renderer pty:kill handler: when the
      // provider emitted its own exit during shutdown, the exit listener already
      // delivered runtime + renderer exits — synthesizing again would double-fire.
      void shutdownProviderAndDetectExit(provider, ptyId, { immediate: false })
        .then((providerExitObserved) => {
          finishPtyShutdown(ptyId)
          if (!providerExitObserved) {
            runtime?.onPtyExit(ptyId, -1)
          }
        })
        .catch((err) => {
          if (isPtyAlreadyGoneError(err)) {
            finishPtyShutdown(ptyId)
            runtime?.onPtyExit(ptyId, -1)
            return
          }
          console.warn(
            `[pty] Failed to stop PTY ${ptyId}: ${err instanceof Error ? err.message : String(err)}`
          )
          // Why: callers of controller.kill must observe a kill→exit pair so
          // runtime tail buffers close and agents stop treating the pane as
          // live. Preserve provider/lease state so a retry can still target
          // the remote PTY if it survived the transient failure.
          runtime?.onPtyExit(ptyId, -1)
        })
      return true
    },
    stopAndWait: async (ptyId, opts) => {
      let provider: IPtyProvider
      let connectionId: string | null | undefined = ptyOwnership.get(ptyId)
      const parsedSshId = connectionId === undefined ? parseAppSshPtyId(ptyId) : null
      connectionId ??= parsedSshId?.connectionId
      try {
        provider = connectionId ? getProvider(connectionId) : getProviderForPty(ptyId)
      } catch {
        if (connectionId) {
          finishPtyShutdown(ptyId)
          runtime?.onPtyExit(ptyId, -1)
          return true
        }
        return false
      }
      let providerExitObserved = false
      try {
        providerExitObserved = await shutdownProviderAndDetectExit(provider, ptyId, {
          immediate: true,
          keepHistory: opts?.keepHistory ?? false
        })
      } catch (err) {
        if (!isPtyAlreadyGoneError(err)) {
          console.warn(
            `[pty] Failed to stop PTY ${ptyId}: ${err instanceof Error ? err.message : String(err)}`
          )
          return false
        }
      }
      try {
        if (!(await verifyPtyStopped(provider, ptyId, opts))) {
          return false
        }
      } catch (err) {
        console.warn(
          `[pty] Failed to verify PTY ${ptyId} stopped: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
        return false
      }
      finishPtyShutdown(ptyId)
      if (!providerExitObserved) {
        runtime?.onPtyExit(ptyId, -1)
      }
      return true
    },
    getForegroundProcess: async (ptyId) => {
      try {
        return await getProviderForPty(ptyId).getForegroundProcess(ptyId)
      } catch {
        return null
      }
    },
    confirmForegroundProcess: async (ptyId) => {
      try {
        const provider = getProviderForPty(ptyId)
        // Why: cached foreground evidence cannot resolve a fresh shell conflict.
        return (await provider.confirmForegroundProcess?.(ptyId)) ?? null
      } catch {
        return null
      }
    },
    getCwd: async (ptyId) => {
      try {
        const cwd = await getProviderForPty(ptyId).getCwd(ptyId)
        return cwd || null
      } catch {
        return null
      }
    },
    hasChildProcesses: async (ptyId) => {
      try {
        return await getProviderForPty(ptyId).hasChildProcesses(ptyId)
      } catch {
        return false
      }
    },
    clearBuffer: async (ptyId) => {
      try {
        await getProviderForPty(ptyId).clearBuffer(ptyId)
      } catch {
        /* best effort: renderer clear still handles local PTYs */
      }
    },
    hasPty: (ptyId) => {
      const ownedConnectionId = ptyOwnership.get(ptyId)
      const parsedSshId = ownedConnectionId === undefined ? parseAppSshPtyId(ptyId) : null
      try {
        const provider = parsedSshId
          ? getProvider(parsedSshId.connectionId)
          : getProviderForPty(ptyId)
        return provider.hasPty?.(ptyId) ?? null
      } catch {
        // Why: only an authoritative false may retire a restored Mobile terminal.
        return null
      }
    },
    listProcesses: async () => {
      // Why: no transport registers a connection-scoped PTY provider (SSH
      // removal, #63), so the local provider is the only source left.
      return getLocalPtyProvider().listProcesses()
    },
    serializeProviderBuffer: async (ptyId, opts) => {
      try {
        // Why: restored daemon PTYs can be live while their desktop pane stays
        // unmounted; query the provider model so phone-local navigation works.
        return (await getProviderForPty(ptyId).getBufferSnapshot?.(ptyId, opts)) ?? null
      } catch {
        return null
      }
    },
    getSize: (ptyId) => ptySizes.get(ptyId) ?? null,
    resize: (ptyId, cols, rows) => {
      try {
        getProviderForPty(ptyId).resize(ptyId, cols, rows)
        ptySizes.set(ptyId, { cols, rows })
        return true
      } catch {
        return false
      }
    }
  }
}
