import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { browseRuntimeServerDirectory } from '~renderer/runtime/server-directory-browser'

import type { DirEntry } from './remote-file-browser-state'

export type RemoteDirectoryBrowseResult = { resolvedPath: string; entries: DirEntry[] }

export function useRemoteDirectory(
  runtimeEnvironmentId: string,
  initialPath: string
): {
  entries: DirEntry[]
  error: string | null
  fetchListing: (path: string) => Promise<RemoteDirectoryBrowseResult>
  homePathRef: RefObject<string | null>
  invalidateRequests: () => void
  loadDirectory: (path: string) => Promise<void>
  loading: boolean
  resolvedPath: string
} {
  const [resolvedPath, setResolvedPath] = useState('')
  const [entries, setEntries] = useState<DirEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const generationRef = useRef(0)
  const listingCacheRef = useRef<Map<string, RemoteDirectoryBrowseResult>>(new Map())
  const homePathRef = useRef<string | null>(null)

  const invalidateRequests = useCallback(() => {
    generationRef.current++
  }, [])
  const fetchListing = useCallback(
    async (path: string): Promise<RemoteDirectoryBrowseResult> => {
      const cached = listingCacheRef.current.get(path)
      if (cached) {
        return cached
      }
      const result = await browseRuntimeServerDirectory(runtimeEnvironmentId, path)
      listingCacheRef.current.set(result.resolvedPath, result)
      if (path !== result.resolvedPath) {
        listingCacheRef.current.set(path, result)
      }
      return result
    },
    [runtimeEnvironmentId]
  )
  const loadDirectory = useCallback(
    async (path: string): Promise<void> => {
      const generation = ++generationRef.current
      setLoading(true)
      setError(null)
      try {
        const result = await fetchListing(path)
        if (generation !== generationRef.current) {
          return
        }
        setResolvedPath(result.resolvedPath)
        setEntries(result.entries)
        if (path === '~') {
          homePathRef.current = result.resolvedPath
        }
      } catch (caught) {
        if (generation === generationRef.current) {
          setError(caught instanceof Error ? caught.message : String(caught))
          setEntries([])
        }
      } finally {
        if (generation === generationRef.current) {
          setLoading(false)
        }
      }
    },
    [fetchListing]
  )

  useEffect(() => {
    listingCacheRef.current.clear()
    homePathRef.current = null
    void loadDirectory(initialPath)
    return invalidateRequests
  }, [initialPath, invalidateRequests, loadDirectory, runtimeEnvironmentId])

  return {
    entries,
    error,
    fetchListing,
    homePathRef,
    invalidateRequests,
    loadDirectory,
    loading,
    resolvedPath
  }
}
