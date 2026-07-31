import { useEffect } from 'react'
import {
  cancelPendingSimulatorPaneShutdown,
  scheduleSimulatorPaneManagedShutdown
} from '~renderer/components/emulator-pane/simulator-pane-shutdown-scheduler'

import type { SimulatorDeviceRow } from './types'

type UseEmulatorPaneLifecycleArgs = {
  mountedRef: { current: boolean }
  refreshDevices: () => Promise<SimulatorDeviceRow[]>
  tabId?: string
  worktreeId: string
}

export function useEmulatorPaneLifecycle({
  mountedRef,
  refreshDevices,
  tabId,
  worktreeId
}: UseEmulatorPaneLifecycleArgs): void {
  useEffect(() => {
    mountedRef.current = true
    cancelPendingSimulatorPaneShutdown(worktreeId)
    void refreshDevices()
    return () => {
      mountedRef.current = false
      scheduleSimulatorPaneManagedShutdown(worktreeId, tabId)
    }
  }, [mountedRef, refreshDevices, tabId, worktreeId])
}
