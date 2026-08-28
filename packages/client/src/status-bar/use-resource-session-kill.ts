import type { Dispatch, SetStateAction } from 'react'
import { useRef, useState } from 'react'
import { useMountedRef } from '~renderer/react/use-mounted-ref'
import { killRuntimeTerminalSession } from '~renderer/runtime/terminal-inspection'

import {
  buildResourceSessionBindingIndex,
  type ResourceSessionBindingInputs
} from './resource-session-bindings'
import type { DaemonSession, UnifiedSessionRow } from './resource-usage-merge-types'

type UseResourceSessionKillOptions = {
  sessions: DaemonSession[]
  setSessions: Dispatch<SetStateAction<DaemonSession[]>>
  bindings: ResourceSessionBindingInputs
  refreshSessions: () => Promise<void>
}

export type ResourceSessionKill = {
  confirmation: UnifiedSessionRow | null
  isKilling: boolean
  setConfirmation: Dispatch<SetStateAction<UnifiedSessionRow | null>>
  setPopoverBodyNode: (node: HTMLDivElement | null) => void
  request: (session: UnifiedSessionRow) => void
  killOrphans: () => Promise<void>
  confirm: () => Promise<void>
}

export function useResourceSessionKill({
  sessions,
  setSessions,
  bindings,
  refreshSessions
}: UseResourceSessionKillOptions): ResourceSessionKill {
  const [confirmation, setConfirmation] = useState<UnifiedSessionRow | null>(null)
  const [isKilling, setIsKilling] = useState(false)
  const popoverBodyRef = useRef<HTMLDivElement | null>(null)
  const focusFrameRef = useRef<number | null>(null)
  const mountedRef = useMountedRef()

  const cancelFocusFrame = (): void => {
    if (focusFrameRef.current !== null) {
      cancelAnimationFrame(focusFrameRef.current)
      focusFrameRef.current = null
    }
  }

  const setPopoverBodyNode = (node: HTMLDivElement | null): void => {
    if (!node) {
      cancelFocusFrame()
    }
    popoverBodyRef.current = node
  }

  const request = (session: UnifiedSessionRow): void => {
    if (session.bound) {
      setConfirmation(session)
      return
    }
    setSessions((current) => current.filter((item) => item.id !== session.sessionId))
    // Why: refresh after the kill settles so an optimistic row cannot be reintroduced by a race.
    void killRuntimeTerminalSession(session.sessionId)
      .catch(() => undefined)
      .then(refreshSessions)
  }

  const killOrphans = async (): Promise<void> => {
    if (!bindings.workspaceSessionReady) {
      return
    }
    const bound = buildResourceSessionBindingIndex(bindings).boundPtyIds
    const orphans = sessions.filter((session) => !bound.has(session.id))
    if (orphans.length === 0) {
      return
    }
    const orphanIds = new Set(orphans.map((session) => session.id))
    setSessions((current) => current.filter((session) => !orphanIds.has(session.id)))
    await Promise.allSettled(orphans.map((session) => killRuntimeTerminalSession(session.id)))
    void refreshSessions()
  }

  const confirm = async (): Promise<void> => {
    if (!confirmation) {
      return
    }
    const target = confirmation
    setIsKilling(true)
    setSessions((current) => current.filter((session) => session.id !== target.sessionId))
    try {
      await killRuntimeTerminalSession(target.sessionId)
    } catch {
      // Why: an already-exited session satisfies the user's requested end state.
    } finally {
      if (mountedRef.current) {
        setIsKilling(false)
        setConfirmation(null)
        cancelFocusFrame()
        if (popoverBodyRef.current) {
          focusFrameRef.current = requestAnimationFrame(() => {
            focusFrameRef.current = null
            popoverBodyRef.current?.focus()
          })
        }
        void refreshSessions()
      }
    }
  }

  return {
    confirmation,
    isKilling,
    setConfirmation,
    setPopoverBodyNode,
    request,
    killOrphans,
    confirm
  }
}
