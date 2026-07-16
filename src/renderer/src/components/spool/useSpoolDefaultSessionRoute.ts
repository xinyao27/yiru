import { useEffect, useRef } from 'react'
import type { SpoolSessionCatalogEntry } from '../../../../shared/spool/spool-catalog-contract'
import type { SpoolWorkspaceRoute } from '@/store/slices/spool-sharing-types'

export function useSpoolDefaultSessionRoute(args: {
  route: SpoolWorkspaceRoute
  sessions: readonly SpoolSessionCatalogEntry[]
  setActiveRoute: (route: SpoolWorkspaceRoute) => void
}): void {
  const handledRef = useRef(false)
  const { route, sessions, setActiveRoute } = args

  useEffect(() => {
    if (handledRef.current) {
      return
    }
    if (route.sessionRef) {
      handledRef.current = true
      return
    }
    const firstSessionRef = sessions[0]?.sessionRef
    if (!firstSessionRef) {
      return
    }
    // Why: catalog pagination may finish after the worktree opens; choose its
    // first tab once without later overriding deliberate session navigation.
    handledRef.current = true
    setActiveRoute({ ...route, sessionRef: firstSessionRef })
  }, [route, sessions, setActiveRoute])
}
