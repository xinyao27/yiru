import { useEffect } from 'react'
import { useAppStore } from '@/store'

export function useSpoolSharingBridge(): void {
  const applySnapshot = useAppStore((state) => state.applySpoolSharingSnapshot)
  const resetSpoolSharing = useAppStore((state) => state.resetSpoolSharing)

  useEffect(() => {
    const api = window.api?.spoolSharing
    if (!api) {
      return
    }

    let disposed = false
    let receivedEvent = false
    const unsubscribe = api.onChanged((snapshot) => {
      if (disposed) {
        return
      }
      receivedEvent = true
      applySnapshot(snapshot)
    })

    void api
      .getSnapshot()
      .then((snapshot) => {
        // Why: an event can overtake the initial invoke over IPC; never let the
        // older response roll the volatile connection/grant generations back.
        if (!disposed && !receivedEvent) {
          applySnapshot(snapshot)
        }
      })
      .catch(() => {
        // Main publishes an unavailable snapshot when diagnostics are safe to
        // show; raw IPC errors are intentionally not projected into renderer UI.
      })

    return () => {
      disposed = true
      unsubscribe()
      resetSpoolSharing()
    }
  }, [applySnapshot, resetSpoolSharing])
}
