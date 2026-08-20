import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { callRuntimeOrpc } from '~renderer/runtime/orpc-client'
import { useAppStore } from '~renderer/store'

import { emulatorPaneErrorMessage } from './error-message'
import { EMULATOR_LOCAL_SHUTDOWN_EVENT } from './use-emulator-pane-session-events'

type UseEmulatorPaneShutdownArgs = {
  loading: boolean
  mountedRef: RefObject<boolean>
  refreshDevices: () => Promise<unknown[]>
  setError: Dispatch<SetStateAction<string | null>>
  setLoading: Dispatch<SetStateAction<boolean>>
  tabId?: string
  worktreeId: string
}

export function useEmulatorPaneShutdown({
  loading,
  mountedRef,
  refreshDevices,
  setError,
  setLoading,
  tabId,
  worktreeId
}: UseEmulatorPaneShutdownArgs) {
  return useCallback(
    async (deviceTarget?: string) => {
      if (loading) {
        return
      }
      setLoading(true)
      setError(null)
      if (tabId) {
        useAppStore.getState().setTabLabel(tabId, 'Shutting down…')
      }
      try {
        const res = (await callRuntimeOrpc(
          { kind: 'local' },
          (client) => client.emulator.shutdown,
          {
            ...(deviceTarget ? { device: deviceTarget } : {}),
            worktree: worktreeId
          }
        )) as { deviceUdid?: string }
        const shutdownTarget = res?.deviceUdid || deviceTarget
        window.dispatchEvent(
          new CustomEvent(EMULATOR_LOCAL_SHUTDOWN_EVENT, {
            detail: { worktreeId, deviceUdid: shutdownTarget }
          })
        )
        void refreshDevices()
      } catch (e: unknown) {
        const msg = emulatorPaneErrorMessage(
          e,
          'Could not shut down the emulator. Try again, or stop it from your emulator manager.'
        )
        setError(msg)
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    },
    [loading, mountedRef, refreshDevices, setError, setLoading, tabId, worktreeId]
  )
}
