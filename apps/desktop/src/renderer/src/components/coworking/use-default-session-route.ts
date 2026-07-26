import { useEffect, useRef } from 'react'

import type { CoworkingWorkspaceRoute } from '@/components/coworking/types'

import type { CoworkingSessionCatalogEntry } from '../../../../shared/coworking/catalog-contract'

export function useCoworkingDefaultSessionRoute(args: {
  route: CoworkingWorkspaceRoute
  sessions: readonly CoworkingSessionCatalogEntry[]
  setActiveRoute: (route: CoworkingWorkspaceRoute) => void
}): void {
  const defaultedEmptyRouteRef = useRef(false)
  const { route, sessions, setActiveRoute } = args

  useEffect(() => {
    if (route.sessionRef) {
      defaultedEmptyRouteRef.current = false
      return
    }
    if (defaultedEmptyRouteRef.current) {
      return
    }
    const firstSessionRef = sessions[0]?.sessionRef
    if (!firstSessionRef) {
      return
    }
    // Why: catalog pagination may finish after the worktree opens; choose its
    // first tab once without later overriding deliberate session navigation.
    defaultedEmptyRouteRef.current = true
    setActiveRoute({ ...route, sessionRef: firstSessionRef })
  }, [route, sessions, setActiveRoute])
}
