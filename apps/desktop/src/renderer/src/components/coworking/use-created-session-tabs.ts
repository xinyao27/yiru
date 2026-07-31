import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CoworkingSessionCatalogEntry,
  CoworkingSessionCatalogPageState
} from '~shared/coworking/catalog-contract'

const MAX_VOLATILE_CREATED_SESSIONS = 64

type VolatileCreatedSession = {
  session: CoworkingSessionCatalogEntry
  catalogObserved: boolean
  catalogRevisionAtRequest: number | null
}

export function useCoworkingCreatedSessionTabs({
  catalogSessions,
  catalogStatus,
  catalogRevision,
  activeSessionRef
}: {
  catalogSessions: readonly CoworkingSessionCatalogEntry[]
  catalogStatus: CoworkingSessionCatalogPageState['status'] | null
  catalogRevision: number | null
  activeSessionRef: string | null
}): {
  sessions: readonly CoworkingSessionCatalogEntry[]
  retainMissingSession: boolean
  recordCreatedSession: (session: CoworkingSessionCatalogEntry) => void
} {
  const [createdSessions, setCreatedSessions] = useState<readonly VolatileCreatedSession[]>([])

  const recordCreatedSession = useCallback(
    (session: CoworkingSessionCatalogEntry): void => {
      const catalogObserved = catalogSessions.some(
        (candidate) => candidate.sessionRef === session.sessionRef
      )
      setCreatedSessions((current) => {
        const next = [
          ...current.filter((entry) => entry.session.sessionRef !== session.sessionRef),
          {
            session,
            catalogObserved,
            catalogRevisionAtRequest: catalogRevision
          }
        ]
        // Why: a long-lived controller can create indefinitely; only recent
        // aliases need bridging while the authoritative paged catalog converges.
        return next.slice(-MAX_VOLATILE_CREATED_SESSIONS)
      })
    },
    [catalogRevision, catalogSessions]
  )

  useEffect(() => {
    if (catalogStatus === null) {
      return
    }
    const catalogRefs = new Set(catalogSessions.map((session) => session.sessionRef))
    const catalogComplete = catalogStatus === 'complete'
    setCreatedSessions((current) => {
      let changed = false
      const next = current.flatMap((entry) => {
        if (catalogRefs.has(entry.session.sessionRef)) {
          if (!entry.catalogObserved) {
            changed = true
            return [{ ...entry, catalogObserved: true }]
          }
          return [entry]
        }
        const completedPostCreateCatalog =
          catalogComplete &&
          catalogRevision !== null &&
          entry.catalogRevisionAtRequest !== null &&
          catalogRevision !== entry.catalogRevisionAtRequest
        if (entry.catalogObserved && catalogComplete) {
          changed = true
          return []
        }
        if (completedPostCreateCatalog) {
          // Why: a creation response can beat paged inventory, but the first
          // authoritative post-request completion may prove a short-lived PTY is already gone.
          changed = true
          return []
        }
        return [entry]
      })
      return changed ? next : current
    })
  }, [catalogRevision, catalogSessions, catalogStatus, createdSessions])

  const sessions = useMemo(
    () => mergeCoworkingCreatedSessionTabs(catalogSessions, createdSessions),
    [catalogSessions, createdSessions]
  )
  const retainMissingSession = Boolean(
    activeSessionRef &&
    createdSessions.some((entry) => entry.session.sessionRef === activeSessionRef) &&
    !catalogSessions.some((session) => session.sessionRef === activeSessionRef)
  )

  return { sessions, retainMissingSession, recordCreatedSession }
}

function mergeCoworkingCreatedSessionTabs(
  catalogSessions: readonly CoworkingSessionCatalogEntry[],
  createdSessions: readonly VolatileCreatedSession[]
): readonly CoworkingSessionCatalogEntry[] {
  if (createdSessions.length === 0) {
    return catalogSessions
  }
  const merged = [...catalogSessions]
  const catalogRefs = new Set(catalogSessions.map((session) => session.sessionRef))
  for (const { session } of createdSessions) {
    if (!catalogRefs.has(session.sessionRef)) {
      merged.push(session)
    }
  }
  return merged
}
