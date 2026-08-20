import { useCallback, useRef, useSyncExternalStore } from 'react'

export type CoworkingTerminalAttachment = {
  attachFailed: boolean
  markAttachFailed: () => void
}

// Why: whether xterm attached to the DOM is a fact about an imperative host
// library, only knowable after commit — not state React can derive or seed. The
// mount effect publishes it through this store and render subscribes, so the
// outcome never has to be mirrored into a status the subscription also writes.
export function useCoworkingTerminalAttachment(): CoworkingTerminalAttachment {
  const attachFailedRef = useRef(false)
  const listenersRef = useRef<Set<() => void>>(new Set())

  const subscribe = useCallback((onStoreChange: () => void) => {
    listenersRef.current.add(onStoreChange)
    return () => {
      listenersRef.current.delete(onStoreChange)
    }
  }, [])
  const getSnapshot = useCallback((): boolean => attachFailedRef.current, [])
  const attachFailed = useSyncExternalStore(subscribe, getSnapshot)

  // Why: a failed attach is permanent for this mount — latch it so a repeated
  // report cannot churn subscribers, and so remounting is the only way back.
  const markAttachFailed = useCallback((): void => {
    if (attachFailedRef.current) {
      return
    }
    attachFailedRef.current = true
    for (const listener of listenersRef.current) {
      listener()
    }
  }, [])

  return { attachFailed, markAttachFailed }
}
