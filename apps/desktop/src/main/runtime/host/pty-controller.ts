import { mintPtySessionId } from '~main/daemon/pty-session-id'
import type { Store } from '~main/persistence'
import type { IPtyProvider, PtySpawnOptions } from '~main/providers/types'
import { makePaneKey } from '~shared/stable-pane-id'

import type { YiruRuntimeService } from '../yiru-runtime'

export type NodeRuntimeHostPtyController = {
  dispose: () => void
}

export function attachNodeRuntimeHostPtyController(
  runtime: YiruRuntimeService,
  store: Store,
  provider: IPtyProvider
): NodeRuntimeHostPtyController {
  const removeDataListener = provider.onData((payload) => {
    runtime.onPtyData(
      payload.id,
      payload.data,
      Date.now(),
      payload.sequenceChars ?? payload.data.length
    )
  })
  const removeReplayListener = provider.onReplay((payload) => {
    runtime.onPtyData(payload.id, payload.data, Date.now())
  })
  const removeExitListener = provider.onExit((payload) => {
    runtime.onPtyExit(payload.id, payload.code)
  })
  const removeBackgroundListener =
    provider.onBackgroundStreamEvent?.((event) => {
      if (event.kind === 'backgroundMarker') {
        runtime.setPtyTransientFactDelegation(event.id, event.background, event.scanSeedAnsi)
        return
      }
      if (event.kind === 'dataGap') {
        runtime.notePtyDataGap(event.id, event.sequenceChars ?? event.droppedChars)
        return
      }
      runtime.emitDaemonPtyTransientFact(event.id, event.fact)
    }) ?? (() => {})

  runtime.setPtyController({
    spawn: async (args) => {
      if (args.connectionId) {
        throw new Error('runtime_host_remote_pty_unsupported')
      }
      const paneKey = args.tabId && args.leafId ? makePaneKey(args.tabId, args.leafId) : undefined
      const sessionId = args.sessionId?.trim() || mintPtySessionId(args.worktreeId)
      const spawnOptions: PtySpawnOptions = {
        cols: args.cols,
        rows: args.rows,
        cwd: args.cwd,
        env: {
          ...args.env,
          ...(args.preAllocatedHandle ? { YIRU_TERMINAL_HANDLE: args.preAllocatedHandle } : {})
        },
        envToDelete: args.envToDelete,
        command: args.command,
        commandDelivery: args.commandDelivery,
        startupCommandDelivery: args.startupCommandDelivery,
        launchAgent: args.launchAgent,
        worktreeId: args.worktreeId,
        paneKey,
        tabId: args.tabId,
        sessionId,
        isNewSession: args.sessionId === undefined
      }
      const runtimeSequenceAtSpawnStart = runtime.getPtyOutputSequence(sessionId)
      const result = await provider.spawn(spawnOptions)
      if (result.providerSequence) {
        runtime.synchronizePtyOutputSequenceFromProvider(
          result.id,
          result.providerSequence,
          runtimeSequenceAtSpawnStart
        )
      }
      if (args.preAllocatedHandle) {
        runtime.registerPreAllocatedHandleForPty(result.id, args.preAllocatedHandle)
      }
      if (args.worktreeId) {
        runtime.registerPty(
          result.id,
          args.worktreeId,
          null,
          args.tabId && args.leafId ? { tabId: args.tabId, leafId: args.leafId } : undefined
        )
      }
      runtime.noteTerminalSpawnCommand(result.id, args.command)
      if (args.persistHostSessionBinding && args.worktreeId && args.tabId && args.leafId) {
        try {
          store.persistPtyBinding({
            worktreeId: args.worktreeId,
            worktreeInstanceId: store.getWorktreeMeta(args.worktreeId)?.instanceId ?? null,
            tabId: args.tabId,
            leafId: args.leafId,
            ptyId: result.id,
            ...(args.cwd ? { startupCwd: args.cwd } : {})
          })
        } catch (error) {
          await provider.shutdown(result.id, { immediate: true }).catch(() => {})
          throw error
        }
      }
      return { id: result.id }
    },
    write: (ptyId, data) => {
      try {
        provider.write(ptyId, data)
        return true
      } catch {
        return false
      }
    },
    kill: (ptyId) => {
      if (provider.hasPty?.(ptyId) === false) {
        return false
      }
      void provider.shutdown(ptyId, { immediate: true }).catch(() => {})
      return true
    },
    stopAndWait: async (ptyId, options) => {
      if (provider.hasPty?.(ptyId) === false) {
        return false
      }
      await provider.shutdown(ptyId, {
        immediate: true,
        ...(options?.keepHistory ? { keepHistory: true } : {})
      })
      return true
    },
    getCwd: (ptyId) => provider.getCwd(ptyId).catch(() => null),
    getForegroundProcess: (ptyId) => provider.getForegroundProcess(ptyId),
    confirmForegroundProcess: provider.confirmForegroundProcess
      ? (ptyId) => provider.confirmForegroundProcess!(ptyId)
      : undefined,
    hasChildProcesses: (ptyId) => provider.hasChildProcesses(ptyId),
    clearBuffer: (ptyId) => provider.clearBuffer(ptyId),
    resize: (ptyId, cols, rows) => {
      try {
        provider.resize(ptyId, cols, rows)
        return true
      } catch {
        return false
      }
    },
    pauseProducer: (ptyId) => provider.pauseProducer?.(ptyId),
    resumeProducer: (ptyId) => provider.resumeProducer?.(ptyId),
    sendSignal: (ptyId, signal) => provider.sendSignal(ptyId, signal),
    hasPty: (ptyId) => provider.hasPty?.(ptyId) ?? null,
    listProcesses: () => provider.listProcesses(),
    serializeProviderBuffer: provider.getBufferSnapshot
      ? (ptyId, options) => provider.getBufferSnapshot!(ptyId, options)
      : undefined,
    hasRendererSerializer: () => false,
    getRendererSerializerGeneration: () => 0,
    waitForRendererSerializer: async () => false
  })

  return {
    dispose: () => {
      runtime.setPtyController(null)
      removeBackgroundListener()
      removeExitListener()
      removeReplayListener()
      removeDataListener()
    }
  }
}
