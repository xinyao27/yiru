import { useCallback, useRef, useState } from 'react'

type UseTerminalLiveInputModeOptions = {
  readonly hostId: string
  readonly worktreeId: string
}

type TerminalLiveInputRouteState = {
  readonly handles: Set<string>
  readonly routeKey: string
}

const EMPTY_TERMINAL_HANDLES = new Set<string>()

export function useTerminalLiveInputMode({ hostId, worktreeId }: UseTerminalLiveInputModeOptions) {
  const routeKey = JSON.stringify([hostId, worktreeId])
  const [routeState, setRouteState] = useState<TerminalLiveInputRouteState>(() => ({
    handles: new Set(),
    routeKey
  }))
  const liveInputTerminalHandles =
    routeState.routeKey === routeKey ? routeState.handles : EMPTY_TERMINAL_HANDLES
  const liveInputTerminalHandlesRef = useRef<Set<string>>(new Set())
  liveInputTerminalHandlesRef.current = liveInputTerminalHandles

  const defaultTerminalHandlesToLiveInput = useCallback(
    (handles: readonly string[]) => {
      const next = new Set(liveInputTerminalHandlesRef.current)
      for (const handle of handles) {
        next.add(handle)
      }
      if (next.size === liveInputTerminalHandlesRef.current.size) {
        return
      }
      liveInputTerminalHandlesRef.current = next
      setRouteState({ handles: next, routeKey })
    },
    [routeKey]
  )

  const pruneTerminalHandlesFromLiveInput = useCallback(
    (liveHandles: ReadonlySet<string>) => {
      const next = new Set(
        [...liveInputTerminalHandlesRef.current].filter((handle) => liveHandles.has(handle))
      )
      if (next.size === liveInputTerminalHandlesRef.current.size) {
        return
      }
      liveInputTerminalHandlesRef.current = next
      setRouteState({ handles: next, routeKey })
    },
    [routeKey]
  )

  const clearTerminalLiveInputDefault = useCallback(
    (handle: string) => {
      if (!liveInputTerminalHandlesRef.current.has(handle)) {
        return
      }
      const next = new Set(liveInputTerminalHandlesRef.current)
      next.delete(handle)
      liveInputTerminalHandlesRef.current = next
      setRouteState({ handles: next, routeKey })
    },
    [routeKey]
  )

  return {
    clearTerminalLiveInputDefault,
    defaultTerminalHandlesToLiveInput,
    liveInputTerminalHandles,
    liveInputTerminalHandlesRef,
    pruneTerminalHandlesFromLiveInput
  }
}
