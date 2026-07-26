import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { translate } from '@/i18n/i18n'

import type { CoworkingFileListResult } from '../../../../shared/coworking/operation-contract'
import { parseCoworkingFileListResult } from './owner-result-validation'
import {
  invokeCoworkingWorkspaceRead,
  CoworkingWorkspaceOperationError
} from './workspace-operation'
import { getCoworkingWorktreeRouteKey, type CoworkingWorktreeRoute } from './worktree-route'

export function useCoworkingFileTreeState(operationRoute: CoworkingWorktreeRoute): {
  expanded: ReadonlySet<string>
  listings: ReadonlyMap<string, CoworkingFileListResult>
  loadingDirectories: ReadonlySet<string>
  unavailableDirectories: ReadonlySet<string>
  showDotfiles: boolean
  collapseAll: () => void
  expandDirectory: (relativePath: string) => void
  loadDirectory: (relativePath: string) => Promise<void>
  refreshTree: () => Promise<void>
  toggleDirectory: (relativePath: string) => void
  toggleDotfiles: () => void
} {
  const [listings, setListings] = useState<ReadonlyMap<string, CoworkingFileListResult>>(
    () => new Map()
  )
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set())
  const [loadingDirectories, setLoadingDirectories] = useState<ReadonlySet<string>>(
    () => new Set([''])
  )
  const [unavailableDirectories, setUnavailableDirectories] = useState<ReadonlySet<string>>(
    () => new Set()
  )
  const [showDotfiles, setShowDotfiles] = useState(true)
  const requestSequenceByDirectory = useRef(new Map<string, number>())
  const nextRequestSequence = useRef(0)
  const routeKey = getCoworkingWorktreeRouteKey(operationRoute)
  const activeRouteKey = useRef(routeKey)
  activeRouteKey.current = routeKey

  const loadDirectory = useCallback(
    async (relativePath: string): Promise<void> => {
      const request = ++nextRequestSequence.current
      requestSequenceByDirectory.current.set(relativePath, request)
      setLoadingDirectories((current) => new Set(current).add(relativePath))
      setUnavailableDirectories((current) => {
        const next = new Set(current)
        next.delete(relativePath)
        return next
      })
      try {
        const value = await invokeCoworkingWorkspaceRead(operationRoute, 'files.list', {
          relativePath,
          limit: 5_000
        })
        const result = parseCoworkingFileListResult(value)
        if (
          routeKey === activeRouteKey.current &&
          request === requestSequenceByDirectory.current.get(relativePath)
        ) {
          setListings((current) => new Map(current).set(relativePath, result))
        }
      } catch (error) {
        if (
          routeKey === activeRouteKey.current &&
          request === requestSequenceByDirectory.current.get(relativePath) &&
          !isStaleRouteError(error)
        ) {
          setUnavailableDirectories((current) => new Set(current).add(relativePath))
          toast.error(
            translate(
              'auto.components.coworking.CoworkingFilesPane.listFailed',
              'Could not load files.'
            )
          )
        }
      } finally {
        if (
          routeKey === activeRouteKey.current &&
          request === requestSequenceByDirectory.current.get(relativePath)
        ) {
          setLoadingDirectories((current) => {
            const next = new Set(current)
            next.delete(relativePath)
            return next
          })
        }
      }
    },
    [operationRoute, routeKey]
  )

  useEffect(() => {
    const requestSequences = requestSequenceByDirectory.current
    // Why: remote routes may reuse relative paths while old SSH requests are still in flight.
    requestSequences.clear()
    setListings(new Map())
    setExpanded(new Set())
    setLoadingDirectories(new Set(['']))
    setUnavailableDirectories(new Set())
    setShowDotfiles(true)
    void loadDirectory('')
    return () => requestSequences.clear()
  }, [loadDirectory])

  const toggleDirectory = useCallback(
    (relativePath: string): void => {
      const shouldExpand = !expanded.has(relativePath)
      setExpanded((current) => {
        const next = new Set(current)
        if (next.has(relativePath)) {
          next.delete(relativePath)
        } else {
          next.add(relativePath)
        }
        return next
      })
      if (shouldExpand && !listings.has(relativePath)) {
        void loadDirectory(relativePath)
      }
    },
    [expanded, listings, loadDirectory]
  )

  const expandDirectory = useCallback((relativePath: string): void => {
    setExpanded((current) => new Set(current).add(relativePath))
  }, [])

  const refreshTree = useCallback(async (): Promise<void> => {
    await Promise.all([...new Set(['', ...expanded])].map(loadDirectory))
  }, [expanded, loadDirectory])

  return {
    expanded,
    listings,
    loadingDirectories,
    unavailableDirectories,
    showDotfiles,
    collapseAll: () => setExpanded(new Set()),
    expandDirectory,
    loadDirectory,
    refreshTree,
    toggleDirectory,
    toggleDotfiles: () => setShowDotfiles((current) => !current)
  }
}

function isStaleRouteError(error: unknown): boolean {
  return error instanceof CoworkingWorkspaceOperationError && error.code === 'stale_route'
}
