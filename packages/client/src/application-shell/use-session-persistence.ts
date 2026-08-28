import { useEffect } from 'react'

import {
  buildWorkspaceSessionPayload,
  shouldPersistWorkspaceSession
} from '../editor/workspace-session'
import {
  patchWorkspaceSessionByHost,
  persistWorkspaceSessionByHost
} from '../editor/workspace-session-host-persistence'
import { shellClient } from '../runtime/shell-client'
import { shutdownBufferCaptures } from '../runtime/terminal-shutdown-buffer-captures'
import { useAppStore } from '../store/state'
import { registerUpdaterBeforeUnloadBypass } from '../updates/before-unload'
import { createSessionWriteSubscriber } from './session-write-subscriber'
import { dispatchWindowCloseRequest } from './window-close'

const SLEEPING_AGENT_RESUME_CAPTURE_INTERVAL_MS = 60_000

export function useSessionPersistence(): void {
  useEffect(() => registerUpdaterBeforeUnloadBypass(), [])

  useEffect(() => {
    return createSessionWriteSubscriber({
      store: useAppStore,
      persist: ({ patch }) => {
        const state = useAppStore.getState()
        void patchWorkspaceSessionByHost(shellClient.session, patch, state)
      }
    })
  }, [])

  useEffect(() => {
    // Why: manual quit can emit beforeunload twice after terminal panes have
    // unmounted; only the first pass still owns the useful scrollback snapshot.
    let hasCapturedShutdownBuffers = false
    const captureAndFlush = (): void => {
      if (hasCapturedShutdownBuffers || !shouldPersistWorkspaceSession(useAppStore.getState())) {
        return
      }
      for (const capture of shutdownBufferCaptures.values()) {
        try {
          capture({ includeLocalBuffers: false })
        } catch {
          // Why: one failed pane must not prevent the remaining buffers from persisting.
        }
      }
      useAppStore.getState().captureAllSleepingAgentSessions('quit')
      const state = useAppStore.getState()
      void persistWorkspaceSessionByHost(
        shellClient.session,
        buildWorkspaceSessionPayload(state),
        state
      ).catch(() => {})
      hasCapturedShutdownBuffers = true
    }
    window.addEventListener('beforeunload', captureAndFlush)
    return () => window.removeEventListener('beforeunload', captureAndFlush)
  }, [])

  useEffect(() => {
    // Why: hard kills skip beforeunload, so periodically persist only changed
    // agent resume identities; terminal scrollback remains daemon-owned.
    const timer = window.setInterval(() => {
      if (shouldPersistWorkspaceSession(useAppStore.getState())) {
        useAppStore.getState().captureAllSleepingAgentSessions('periodic')
      }
    }, SLEEPING_AGENT_RESUME_CAPTURE_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => shellClient.ui.onWindowCloseRequested(dispatchWindowCloseRequest), [])
}
