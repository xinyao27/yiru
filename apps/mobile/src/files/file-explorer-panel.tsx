import { Stack, useRouter } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, Text, View, type ListRenderItem } from 'react-native'

import { MobileGlassHeader } from '~/components/glass/header'
import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { MobileGlassTextButton } from '~/components/glass/text-button'

import { getWorktreeLabel } from '../session/worktree-label'
import { useHostClient, useForceReconnect } from '../transport/client-context'
import type { RpcSuccess } from '../transport/types'
import {
  beginDirectoryLoad,
  createDirectoryLoadRevisions,
  isCurrentDirectoryLoad,
  resetDirectoryLoadRevisions,
  type DirectoryLoadRevisions
} from './directory-load-revisions'
import { MobileFileExplorerRow } from './file-explorer-row'
import { fileExplorerStyles as styles } from './file-explorer-styles'
import {
  directoryCacheFromFileList,
  isMobileMethodUnavailableError,
  type LegacyFilesListResult
} from './file-list-fallback'
import { navigateToMobileFilePreview } from './file-preview-navigation'
import {
  flattenDirectoryCache,
  getDirectoryCacheState,
  type DirectoryCache,
  type FileExplorerRow,
  type MobileDirEntry
} from './file-tree'

export function MobileFileExplorerPanel(props: {
  hostId: string
  worktreeId: string
  name?: string
  embedded?: boolean
  onRequestClose?: () => void
}) {
  const { hostId, worktreeId, name, embedded, onRequestClose } = props
  const router = useRouter()
  const { client, state: connState } = useHostClient(hostId)
  const forceReconnect = useForceReconnect()
  const scopeRef = useRef('')
  const scope = `${hostId}:${worktreeId}`
  scopeRef.current = scope
  const directoryLoadRevisionsRef = useRef<DirectoryLoadRevisions>(createDirectoryLoadRevisions())
  const pendingDirectoryRetriesRef = useRef<Set<string>>(new Set())
  const directoryCacheRef = useRef<DirectoryCache>({})
  const [directoryCache, setDirectoryCache] = useState<DirectoryCache>({})
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [legacyListTruncated, setLegacyListTruncated] = useState(false)
  const worktreeLabel = getWorktreeLabel(name, worktreeId)

  const loadDirectory = useCallback(
    async (relativePath: string) => {
      const scope = scopeRef.current
      const loadToken = beginDirectoryLoad(directoryLoadRevisionsRef.current, scope, relativePath)
      const rootLoad = relativePath === ''

      if (!client || connState !== 'connected') {
        const message =
          connState === 'connected' ? 'Connecting to desktop...' : 'Waiting for desktop...'
        if (rootLoad) {
          const hasLoadedRoot =
            (getDirectoryCacheState(directoryCacheRef.current, '')?.entries.length ?? 0) > 0
          setLoading(false)
          // Why: transient reconnects should not blank an already browsable tree.
          setError(hasLoadedRoot ? null : message)
        } else {
          setDirectoryCache((prev) => ({
            ...prev,
            [relativePath]: {
              entries: getDirectoryCacheState(prev, relativePath)?.entries ?? [],
              error: message
            }
          }))
        }
        return
      }

      const hadLoadedRoot =
        rootLoad && (getDirectoryCacheState(directoryCacheRef.current, '')?.entries.length ?? 0) > 0
      if (rootLoad) {
        // Why: a reconnect refresh must not blank an already browsable tree —
        // the full-screen spinner unmounts the list and resets scroll.
        if (!hadLoadedRoot) {
          setLoading(true)
        }
        setError(null)
      }
      setDirectoryCache((prev) => ({
        ...prev,
        [relativePath]: {
          entries: getDirectoryCacheState(prev, relativePath)?.entries ?? [],
          loading: true
        }
      }))

      try {
        const response = await client.sendRequest('files.readDir', {
          worktree: `id:${worktreeId}`,
          relativePath
        })
        if (!response.ok) {
          // Why: desktops that predate the files.readDir mobile allowlist
          // entry still serve the capped files.list; fall back so the Files
          // tab keeps working until the desktop updates.
          if (
            rootLoad &&
            isMobileMethodUnavailableError(response.error?.code, response.error?.message)
          ) {
            const legacy = await client.sendRequest('files.list', {
              worktree: `id:${worktreeId}`
            })
            if (legacy.ok) {
              if (
                !isCurrentDirectoryLoad(
                  directoryLoadRevisionsRef.current,
                  scopeRef.current,
                  loadToken
                )
              ) {
                return
              }
              const legacyResult = (legacy as RpcSuccess).result as LegacyFilesListResult
              setDirectoryCache(directoryCacheFromFileList(legacyResult.files))
              // Why: the capped list silently omits files past the cap — keep
              // the legacy explorer's "Showing first 5000" note.
              setLegacyListTruncated(legacyResult.truncated)
              return
            }
            throw new Error(
              legacy.error?.message || response.error?.message || 'Unable to load files'
            )
          }
          throw new Error(response.error?.message || 'Unable to load files')
        }
        if (
          !isCurrentDirectoryLoad(directoryLoadRevisionsRef.current, scopeRef.current, loadToken)
        ) {
          return
        }
        const entries = (response as RpcSuccess).result as MobileDirEntry[]
        if (rootLoad) {
          setLegacyListTruncated(false)
        }
        setDirectoryCache((prev) => ({
          ...prev,
          [relativePath]: { entries }
        }))
      } catch (err) {
        if (
          !isCurrentDirectoryLoad(directoryLoadRevisionsRef.current, scopeRef.current, loadToken)
        ) {
          return
        }
        const message = err instanceof Error ? err.message : 'Unable to load files'
        if (rootLoad) {
          // Why: a failed background refresh keeps the cached tree browsable;
          // only a cold load surfaces the full-screen error.
          setError(hadLoadedRoot ? null : message)
        } else {
          setDirectoryCache((prev) => ({
            ...prev,
            [relativePath]: {
              entries: getDirectoryCacheState(prev, relativePath)?.entries ?? [],
              error: message
            }
          }))
        }
      } finally {
        if (
          rootLoad &&
          isCurrentDirectoryLoad(directoryLoadRevisionsRef.current, scopeRef.current, loadToken)
        ) {
          setLoading(false)
        }
      }
    },
    [client, connState, worktreeId]
  )

  useEffect(() => {
    scopeRef.current = scope
    resetDirectoryLoadRevisions(directoryLoadRevisionsRef.current)
    pendingDirectoryRetriesRef.current.clear()
    directoryCacheRef.current = {}
    setDirectoryCache({})
    setExpanded(new Set())
    setLoading(true)
    setError(null)
    setLegacyListTruncated(false)
  }, [scope])

  useEffect(() => {
    directoryCacheRef.current = directoryCache
  }, [directoryCache])

  useEffect(() => {
    void loadDirectory('')
  }, [hostId, loadDirectory])

  useEffect(() => {
    if (connState !== 'connected' || pendingDirectoryRetriesRef.current.size === 0) {
      return
    }
    const pending = [...pendingDirectoryRetriesRef.current]
    pendingDirectoryRetriesRef.current.clear()
    for (const relativePath of pending) {
      void loadDirectory(relativePath)
    }
  }, [connState, loadDirectory])

  const rows = useMemo(
    () => flattenDirectoryCache(directoryCache, expanded),
    [directoryCache, expanded]
  )

  const toggleDirectory = useCallback(
    (relativePath: string) => {
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(relativePath)) {
          next.delete(relativePath)
        } else {
          next.add(relativePath)
        }
        return next
      })
      const state = getDirectoryCacheState(directoryCache, relativePath)
      if (!expanded.has(relativePath) && !state?.loading && (!state?.entries || state.error)) {
        void loadDirectory(relativePath)
      }
    },
    [directoryCache, expanded, loadDirectory]
  )

  const retryDirectory = useCallback(
    (relativePath: string) => {
      if (connState !== 'connected' && hostId) {
        pendingDirectoryRetriesRef.current.add(relativePath)
        void forceReconnect(hostId)
        return
      }
      void loadDirectory(relativePath)
    },
    [connState, forceReconnect, hostId, loadDirectory]
  )

  const previewFile = useCallback(
    (relativePath: string, displayName: string) => {
      navigateToMobileFilePreview(
        router,
        {
          hostId,
          worktreeId,
          relativePath,
          name: displayName,
          worktreeName: name
        },
        { embedded, onRequestClose }
      )
    },
    [embedded, hostId, name, onRequestClose, router, worktreeId]
  )

  const renderItem: ListRenderItem<FileExplorerRow> = ({ item }) => {
    return (
      <MobileFileExplorerRow
        item={item}
        expanded={expanded}
        onPreviewFile={previewFile}
        onRetryDirectory={retryDirectory}
        onToggleDirectory={toggleDirectory}
      />
    )
  }

  const headerBar = (
    <View className="min-h-15 flex-row items-center gap-2 px-3">
      <MobileGlassIconButton
        accessibilityLabel="Close files"
        icon="close"
        onPress={() => onRequestClose?.()}
      />
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
          Files
        </Text>
        <Text className="text-muted-foreground mt-1 text-xs" numberOfLines={1}>
          {worktreeLabel}
          {legacyListTruncated ? ' - Showing first 5000' : ''}
        </Text>
      </View>
    </View>
  )

  const body = loading ? (
    <View className={styles.state}>
      <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
    </View>
  ) : error ? (
    <View className={styles.state}>
      <Text className="text-destructive text-center text-sm">{error}</Text>
      {/* Why: while disconnected, re-sending the request is useless — revive
          the parked transport instead (issue #5049); loadDirectory re-runs via
          its effect once the new client connects. */}
      <MobileGlassTextButton
        label="Retry"
        onPress={() =>
          connState !== 'connected' && hostId ? void forceReconnect(hostId) : void loadDirectory('')
        }
      />
    </View>
  ) : rows.length === 0 ? (
    <View className={styles.state}>
      <Text className="text-muted-foreground text-sm">No files found</Text>
    </View>
  ) : (
    <FlatList
      data={rows}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      contentContainerClassName="py-2"
      className="flex-1"
    />
  )

  return (
    <View className="bg-background flex-1">
      <Stack.Screen options={{ title: `Files · ${worktreeLabel}` }} />
      {embedded ? <MobileGlassHeader>{headerBar}</MobileGlassHeader> : null}
      {body}
    </View>
  )
}
