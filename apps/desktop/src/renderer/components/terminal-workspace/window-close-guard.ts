import { useCallback, useEffect, useRef, useState } from 'react'
import { getConnectionId } from '~renderer/lib/connection-context'
import { isIntentionalAppRestartInProgress } from '~renderer/lib/updater-beforeunload'
import { isRemoteRuntimePtyId } from '~renderer/runtime/terminal-inspection'
import { useAppStore } from '~renderer/store'

import type { OpenFile } from '../editor/state'
import { setWindowCloseRequestHandler } from '../window-close-request-coordinator'
import { useEditorCloseQueue, type QueueEditorCloseRequests } from './editor-close-queue'

export type { QueueEditorCloseRequests }

type WindowCloseGuard = {
  saveDialogFileId: string | null
  saveDialogFile: OpenFile | null
  windowCloseDialogOpen: boolean
  setWindowCloseDialogOpen: (open: boolean) => void
  handleCloseFile: (fileId: string) => void
  queueEditorCloseRequests: QueueEditorCloseRequests
  handleSaveDialogSave: () => Promise<void>
  handleSaveDialogDiscard: () => Promise<void>
  handleSaveDialogCancel: () => void
}

// Why: gates window/app close behind the editor unsaved-changes queue. A
// window-close request with dirty files remembers `isQuitting` here, enqueues
// every dirty file into `useEditorCloseQueue`, then proceeds to the native
// close once that queue drains (or clears the pending close if the user
// cancels the dialog).
export function useWindowCloseGuard(): WindowCloseGuard {
  const [windowCloseDialogOpen, setWindowCloseDialogOpen] = useState(false)

  // Why: when the main process requests a close while editor tabs are dirty, we
  // must not call confirmWindowClose() until the user saves or discards. The
  // global beforeunload guard still calls preventDefault() while any file is
  // dirty, so an immediate confirm would leave the window open with no UI.
  const windowCloseAfterDirtyRef = useRef<{ isQuitting: boolean } | null>(null)

  const proceedToNativeWindowClose = useCallback((isQuitting: boolean) => {
    // Why: defer this synthetic unload until we are actually ready to close so
    // a dirty-tab preventDefault() does not fire during the initial quit IPC
    // (that path can emit will-prevent-unload and clear isQuitting in main).
    window.dispatchEvent(new Event('beforeunload'))
    if (!isQuitting) {
      const state = useAppStore.getState()
      const localPtyIds = Object.entries(state.tabsByWorktree).flatMap(
        ([worktreeId, worktreeTabs]) => {
          const connectionId = getConnectionId(worktreeId)
          if (connectionId !== null) {
            return []
          }
          return worktreeTabs
            .flatMap((tab) => state.ptyIdsByTabId[tab.id] ?? [])
            .filter((ptyId) => !isRemoteRuntimePtyId(ptyId))
        }
      )
      if (localPtyIds.length > 0) {
        void Promise.all(localPtyIds.map((id) => window.api.pty.hasChildProcesses(id))).then(
          (results) => {
            if (results.some(Boolean)) {
              setWindowCloseDialogOpen(true)
            } else {
              window.api.ui.confirmWindowClose()
            }
          }
        )
        return
      }
    }
    window.api.ui.confirmWindowClose()
  }, [])

  const {
    saveDialogFileId,
    saveDialogFile,
    handleCloseFile,
    queueEditorCloseRequests,
    handleSaveDialogSave,
    handleSaveDialogDiscard,
    handleSaveDialogCancel
  } = useEditorCloseQueue({
    onQueueDrained: () => {
      const pending = windowCloseAfterDirtyRef.current
      if (pending) {
        windowCloseAfterDirtyRef.current = null
        proceedToNativeWindowClose(pending.isQuitting)
      }
    },
    onQueueCancelled: () => {
      windowCloseAfterDirtyRef.current = null
    }
  })

  // Warn on window close if there are unsaved editor files
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent): void => {
      // Why: update/manual restarts pre-save dirty tabs and then intentionally
      // close the app. Do not let stale dirty flags veto the relaunch path.
      if (isIntentionalAppRestartInProgress()) {
        return
      }
      const dirtyFiles = useAppStore.getState().openFiles.filter((f) => f.isDirty)
      if (dirtyFiles.length > 0) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Handle main-process window close requests. Terminal sessions are detached
  // by the daemon/SSH lifecycle; only dirty editor files should block close
  // here. Explicit destructive terminal actions keep their own confirms.
  // Why: register into the coordinator rather than subscribing to IPC directly.
  // The single IPC subscription lives at the always-mounted App root, so quits
  // on the no-workspace landing page (where Terminal is not mounted) are still
  // handled instead of deadlocking the window (#5144).
  useEffect(() => {
    setWindowCloseRequestHandler(({ isQuitting }) => {
      if (isIntentionalAppRestartInProgress()) {
        window.api.ui.confirmWindowClose()
        return
      }

      // Why: if a previous close request is already being handled (user is
      // working through dirty-file dialogs), ignore duplicate quit signals
      // to avoid overwriting the in-flight ref and losing the close sequence.
      if (windowCloseAfterDirtyRef.current) {
        return
      }

      const dirtyFiles = useAppStore.getState().openFiles.filter((f) => f.isDirty)
      if (dirtyFiles.length > 0) {
        windowCloseAfterDirtyRef.current = { isQuitting }
        queueEditorCloseRequests(dirtyFiles.map((file) => file.id))
        return
      }

      proceedToNativeWindowClose(isQuitting)
    })
    return () => setWindowCloseRequestHandler(null)
  }, [proceedToNativeWindowClose, queueEditorCloseRequests])

  return {
    saveDialogFileId,
    saveDialogFile,
    windowCloseDialogOpen,
    setWindowCloseDialogOpen,
    handleCloseFile,
    queueEditorCloseRequests,
    handleSaveDialogSave,
    handleSaveDialogDiscard,
    handleSaveDialogCancel
  }
}
