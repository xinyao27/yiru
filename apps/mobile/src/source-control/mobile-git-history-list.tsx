import { memo, useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native'

import { CaretDown as ChevronDown, CaretRight as ChevronRight } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { GitBranchChangeEntry } from '../../../desktop/src/shared/types'
import { spacing } from '../theme/uniwind-theme-values'
import { useForceReconnect } from '../transport/client-context'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState, RpcSuccess } from '../transport/types'
import {
  fetchMobileGitHistory,
  mapMobileCommitRows,
  type MobileCommitRow
} from './mobile-git-history'
import { resolveMobileHistoryScreenView } from './mobile-history-screen-state'

type Props = {
  client: RpcClient | null
  connState: ConnectionState
  worktreeId: string
  // Needed so Retry can revive a parked reconnect loop (STA-1511 / #5049).
  hostId: string
  bottomInset: number
  // Bumped by the hub header refresh so History reloads without remounting.
  refreshNonce?: number
}

// Headerless commit-history list. Extracted from the /history route so the hub's
// History segment and the standalone route render the same body over one code path.
// Memoized: it stays mounted (hidden) while the Changes segment is active, and must
// not re-reconcile its FlatList on every commit-message keystroke re-render.
export const MobileGitHistoryList = memo(function MobileGitHistoryList({
  client,
  connState,
  worktreeId,
  hostId,
  bottomInset,
  refreshNonce = 0
}: Props) {
  const forceReconnect = useForceReconnect()
  const [rows, setRows] = useState<MobileCommitRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filesById, setFilesById] = useState<Record<string, GitBranchChangeEntry[] | 'loading'>>({})

  // Worktree identity change must wipe history immediately — even while
  // disconnected — so a kept-mounted hub segment never shows another tree's commits.
  useEffect(() => {
    setRows(null)
    setError(null)
    setExpanded(null)
    setFilesById({})
  }, [worktreeId])

  useEffect(() => {
    let active = true
    if (!client || connState !== 'connected' || !worktreeId) {
      // Why: leave already-loaded rows (and expand state) alone across a drop —
      // resolveMobileHistoryScreenView keeps them visible (STA-1511).
      return
    }
    // Reset prior error/rows so a successful retry doesn't stay stuck behind a
    // stale error (error wins render precedence).
    setError(null)
    setRows(null)
    setExpanded(null)
    setFilesById({})
    void (async () => {
      try {
        const result = await fetchMobileGitHistory(client, worktreeId)
        if (active) {
          setRows(mapMobileCommitRows(result, Date.now()))
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load history')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [client, connState, reloadNonce, refreshNonce, worktreeId])

  const retry = useCallback(() => {
    setError(null)
    // Why: retrying the fetch is useless while the transport's reconnect loop
    // is parked at its backoff cap — revive the connection instead (mirrors
    // MobileSourceControlPanel / issue #5049). The load effect re-runs via
    // connState once the fresh client connects.
    if (connState !== 'connected' && hostId) {
      void forceReconnect(hostId)
      return
    }
    setReloadNonce((n) => n + 1)
  }, [connState, forceReconnect, hostId])

  const toggleCommit = useCallback(
    (row: MobileCommitRow) => {
      const next = expanded === row.id ? null : row.id
      setExpanded(next)
      if (next && !filesById[row.id]) {
        // No client (disconnected while cached rows stay visible): resolve to an
        // empty file list so the row shows "No file changes" instead of a spinner
        // that never completes — no request can be made.
        if (!client) {
          setFilesById((prev) => ({ ...prev, [row.id]: [] }))
          return
        }
        setFilesById((prev) => ({ ...prev, [row.id]: 'loading' }))
        void client
          .sendRequest('git.commitCompare', { worktree: `id:${worktreeId}`, commitId: row.id })
          .then((response) => {
            const entries = response.ok
              ? ((response as RpcSuccess).result as { entries: GitBranchChangeEntry[] }).entries
              : []
            setFilesById((prev) => {
              // Drop stale responses if the row is no longer loading (collapsed + re-opened).
              if (prev[row.id] !== 'loading') {
                return prev
              }
              return { ...prev, [row.id]: entries }
            })
          })
          .catch(() =>
            setFilesById((prev) => {
              if (prev[row.id] !== 'loading') {
                return prev
              }
              return { ...prev, [row.id]: [] }
            })
          )
      }
    },
    [client, expanded, filesById, worktreeId]
  )

  const renderCommit = useCallback(
    ({ item }: { item: MobileCommitRow }) => {
      const files = filesById[item.id]
      const isOpen = expanded === item.id
      return (
        <View className={styles.commit}>
          <Pressable
            className={cn(styles.commitHeader, styles.commitHeaderPressedActive)}
            onPress={() => toggleCommit(item)}
          >
            {isOpen ? (
              <ChevronDown size={14} colorClassName="accent-muted-foreground" />
            ) : (
              <ChevronRight size={14} colorClassName="accent-muted-foreground" />
            )}
            <View className={styles.commitMain}>
              <Text className={styles.commitSubject} numberOfLines={1}>
                {item.subject}
              </Text>
              <Text className={styles.commitMeta} numberOfLines={1}>
                {item.shortId} · {item.author} · {item.relativeTime}
              </Text>
            </View>
          </Pressable>
          {isOpen ? (
            <View className={styles.files}>
              {files === 'loading' || files === undefined ? (
                <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
              ) : files.length === 0 ? (
                <Text className={styles.empty}>No file changes</Text>
              ) : (
                files.map((file) => (
                  <View key={file.path} className={styles.fileRow}>
                    <Text className={styles.filePath} numberOfLines={1}>
                      {file.path}
                    </Text>
                    <Text className={styles.fileStat}>
                      {file.added ? <Text className={styles.add}>+{file.added} </Text> : null}
                      {file.removed ? <Text className={styles.del}>-{file.removed}</Text> : null}
                    </Text>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </View>
      )
    },
    [expanded, filesById, toggleCommit]
  )

  const view = resolveMobileHistoryScreenView({
    connected: client !== null && connState === 'connected',
    rows,
    error
  })

  if (view.kind === 'error' || view.kind === 'waiting') {
    return (
      <View className={styles.state}>
        <Text className={styles.stateText}>
          {view.kind === 'waiting' ? 'Waiting for desktop...' : view.message}
        </Text>
        <Pressable className={styles.retryButton} onPress={retry} accessibilityLabel="Retry">
          <Text className={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    )
  }
  if (view.kind === 'loading') {
    return (
      <View className={styles.state}>
        <ActivityIndicator colorClassName="accent-muted-foreground" />
      </View>
    )
  }
  if (view.kind === 'empty') {
    return (
      <View className={styles.state}>
        <Text className={styles.stateText}>No commits.</Text>
      </View>
    )
  }
  return (
    <FlatList
      data={view.rows}
      renderItem={renderCommit}
      keyExtractor={(row) => row.id}
      contentContainerStyle={{ paddingBottom: spacing.lg + bottomInset }}
    />
  )
})

const styles = {
  state: cn('flex-1 items-center justify-center p-4'),
  stateText: cn('text-muted-foreground/60 text-[14px]'),
  retryButton: cn('mt-3 px-4 py-2 rounded-none bg-secondary'),
  retryText: cn('text-foreground text-[14px] font-semibold'),
  commit: cn('border-b border-b-border'),
  commitHeader: cn('flex-row items-center gap-2 px-3 py-2.5'),
  commitHeaderPressedActive: cn('active:bg-secondary'),
  commitMain: cn('flex-1 min-w-0'),
  commitSubject: cn('text-foreground text-[14px]'),
  commitMeta: cn('text-muted-foreground/60 text-[12px] font-mono mt-[2px]'),
  files: cn('px-4 pb-2 gap-1'),
  fileRow: cn('flex-row items-center gap-2'),
  filePath: cn('flex-1 text-muted-foreground text-[12px] font-mono'),
  fileStat: cn('text-[12px] font-mono'),
  add: cn('text-[var(--git-decoration-added)]'),
  del: cn('text-[var(--git-decoration-deleted)]'),
  empty: cn('text-muted-foreground/60 text-[12px]')
} as const
