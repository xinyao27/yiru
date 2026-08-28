import { isWebTerminalSurfaceTabId } from '~renderer/runtime/web-terminal-surface-id'

import type { ColdRestoreAgentResumeStartup } from './cold-restore-agent-startup'
import { getPendingFreshSpawn, type FreshSpawnOptions } from './fresh-spawn'
import type { PtyTransport } from './transport-types'

type SessionStartOptions = {
  paneKey: string
  tabId: string
  restoredPtyId: string | null
  existingPtyId: string | null
  hasSleepingAgent: boolean
  hadExistingPaneTransport: boolean
  currentTabLivePtyIds: string[]
  coldRestoreStartup: ColdRestoreAgentResumeStartup | null
  transport: PtyTransport
  cols: number
  rows: number
  getIsDisposed: () => boolean
  resetBeforeAttach: () => void
  captureOutputCallbacks: () => Parameters<PtyTransport['attach']>[0]['callbacks']
  bindAttachedPty: (ptyId: string) => void
  reportError: (message: string) => void
  clearTabPtyId: (ptyId: string) => void
  clearSleepingLayoutBinding: (ptyId: string) => void
  startFresh: (startup?: undefined, options?: FreshSpawnOptions) => Promise<string | null>
  startColdRestore: (startup?: ColdRestoreAgentResumeStartup) => Promise<string | null>
}

export function startPtySession(options: SessionStartOptions): void {
  const restoredSessionId = options.restoredPtyId
  const sleptRemoteSessionId =
    restoredSessionId && options.hasSleepingAgent ? restoredSessionId : null
  const detachedLivePtyId =
    options.existingPtyId && !options.hadExistingPaneTransport && !sleptRemoteSessionId
      ? restoredSessionId
        ? restoredSessionId === options.existingPtyId
          ? restoredSessionId
          : null
        : options.existingPtyId
      : null
  const detachedRemoteLeafPtyId =
    restoredSessionId && !options.hasSleepingAgent ? restoredSessionId : null
  const candidateReattachSessionId =
    restoredSessionId && restoredSessionId !== detachedLivePtyId
      ? restoredSessionId
      : detachedLivePtyId
  const eagerLivePtyId =
    candidateReattachSessionId && options.currentTabLivePtyIds.includes(candidateReattachSessionId)
      ? candidateReattachSessionId
      : null
  if (sleptRemoteSessionId) {
    options.clearSleepingLayoutBinding(sleptRemoteSessionId)
  }
  const attachPtyId = detachedRemoteLeafPtyId ?? detachedLivePtyId ?? eagerLivePtyId
  if (attachPtyId) {
    try {
      options.resetBeforeAttach()
      options.transport.attach({
        existingPtyId: attachPtyId,
        cols: options.cols,
        rows: options.rows,
        callbacks: options.captureOutputCallbacks()
      })
      options.bindAttachedPty(options.transport.getPtyId() ?? attachPtyId)
    } catch (error) {
      options.reportError(error instanceof Error ? error.message : String(error))
      options.clearTabPtyId(attachPtyId)
      void options.startFresh()
    }
    return
  }

  const startForSleepingState = (): void => {
    if (options.coldRestoreStartup || options.hasSleepingAgent) {
      void options.startColdRestore(options.coldRestoreStartup ?? undefined)
    } else {
      void options.startFresh()
    }
  }
  const pendingSpawn = getPendingFreshSpawn(options.paneKey)
  if (!pendingSpawn) {
    startForSleepingState()
    return
  }
  void pendingSpawn
    .then((spawnedPtyId) => {
      if (options.getIsDisposed() || options.transport.getPtyId()) {
        return
      }
      if (!spawnedPtyId) {
        if (!isWebTerminalSurfaceTabId(options.tabId)) {
          console.warn(
            `Pending PTY spawn for tab ${options.tabId} resolved without a PTY id, retrying fresh spawn`
          )
        }
        startForSleepingState()
        return
      }
      options.resetBeforeAttach()
      options.transport.attach({
        existingPtyId: spawnedPtyId,
        cols: options.cols,
        rows: options.rows,
        callbacks: options.captureOutputCallbacks()
      })
      options.bindAttachedPty(options.transport.getPtyId() ?? spawnedPtyId)
    })
    .catch((error) => {
      options.reportError(error instanceof Error ? error.message : String(error))
    })
}
