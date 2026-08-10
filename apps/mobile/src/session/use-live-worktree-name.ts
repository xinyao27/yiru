import { getRepoIdFromWorktreeId } from '@yiru/workbench-model/workspace'
import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'

import type { RpcClient } from '../transport/rpc-client'
import { callRuntimeOrpc, subscribeRuntimeOrpc } from '../transport/runtime-orpc-client'
import type { ConnectionState } from '../transport/types'
import { FLOATING_WORKSPACE_TITLE, isFloatingWorkspaceWorktreeId } from './floating-workspace'
import { getLiveWorktreeDisplayName } from './worktree-display-name'

const WORKTREE_NAME_FALLBACK_POLL_MS = 3000

type Params = {
  client: RpcClient | null
  connState: ConnectionState
  routeName?: string
  worktreeId: string
}

export function useLiveWorktreeName({ client, connState, routeName, worktreeId }: Params): string {
  // Why: the sentinel has no worktree.show record, so its title is fixed and never polled.
  const isFloatingWorkspace = isFloatingWorkspaceWorktreeId(worktreeId)
  const routeNameHint = routeName?.trim() ?? ''
  const [worktreeName, setWorktreeName] = useState(() => ({
    worktreeId,
    name: routeNameHint
  }))

  useEffect(() => {
    setWorktreeName((current) =>
      current.worktreeId === worktreeId && current.name === routeNameHint
        ? current
        : { worktreeId, name: routeNameHint }
    )
  }, [routeNameHint, worktreeId])

  useFocusEffect(
    useCallback(() => {
      if (isFloatingWorkspace || !client || connState !== 'connected') {
        return
      }
      let stale = false
      let eventStreamReady = false
      let hasSuccessfulRefresh = false
      let fallbackInterval: ReturnType<typeof setInterval> | null = null
      let refreshGeneration = 0
      const repoId = getRepoIdFromWorktreeId(worktreeId)

      const stopFallbackPoll = (): void => {
        if (fallbackInterval !== null) {
          clearInterval(fallbackInterval)
          fallbackInterval = null
        }
      }
      const refreshWorktreeName = async (): Promise<void> => {
        // Why: an event-driven refresh can overtake a slow fallback request;
        // only the newest read may publish or stop the retry poll.
        const generation = ++refreshGeneration
        try {
          const result = await callRuntimeOrpc(client, (runtime) => runtime.worktree.show, {
            worktree: `id:${worktreeId}`
          })
          if (stale || generation !== refreshGeneration) {
            return
          }
          const liveName = result.worktree
            ? getLiveWorktreeDisplayName([result.worktree], worktreeId)
            : null
          if (liveName) {
            setWorktreeName((current) =>
              current.worktreeId === worktreeId && current.name === liveName
                ? current
                : { worktreeId, name: liveName }
            )
          }
          hasSuccessfulRefresh = true
          if (eventStreamReady) {
            stopFallbackPoll()
          }
        } catch {
          // Non-fatal: the route param remains a usable label until the next refresh.
        }
      }

      const startFallbackPoll = (): void => {
        if (stale || fallbackInterval !== null) {
          return
        }
        fallbackInterval = setInterval(
          () => void refreshWorktreeName(),
          WORKTREE_NAME_FALLBACK_POLL_MS
        )
      }
      const onEventStreamLost = (): void => {
        if (stale) {
          return
        }
        eventStreamReady = false
        startFallbackPoll()
      }
      const invalidateAndRefresh = (): void => {
        hasSuccessfulRefresh = false
        startFallbackPoll()
        void refreshWorktreeName()
      }

      startFallbackPoll()
      const unsubscribe = subscribeRuntimeOrpc(
        client,
        (runtime) => runtime.runtime.clientEvents.subscribe,
        undefined,
        (event) => {
          if (stale) {
            return
          }
          if (event.type === 'ready') {
            const replayedAfterReconnect = eventStreamReady
            eventStreamReady = true
            if (hasSuccessfulRefresh) {
              stopFallbackPoll()
            }
            if (replayedAfterReconnect) {
              // Why: client events are not queued while disconnected, so replay
              // readiness must re-read the title once to close that event gap.
              invalidateAndRefresh()
            }
            return
          }
          if (event.type === 'end') {
            onEventStreamLost()
            return
          }
          if (
            event.type === 'reposChanged' ||
            (event.type === 'worktreesChanged' && event.repoId === repoId)
          ) {
            invalidateAndRefresh()
          }
        },
        // Why: under oRPC a broken stream rejects instead of emitting a
        // synthetic 'error' event, so the fallback poll is restarted here.
        { onError: onEventStreamLost }
      )
      // Why: route params are only an entry hint. The desktop/runtime owns
      // displayName. Modern runtimes push invalidations; the poll remains only
      // until that stream proves available, preserving older-runtime behavior.
      void refreshWorktreeName()
      return () => {
        stale = true
        stopFallbackPoll()
        unsubscribe()
      }
    }, [client, connState, isFloatingWorkspace, worktreeId])
  )

  if (isFloatingWorkspace) {
    return FLOATING_WORKSPACE_TITLE
  }
  return worktreeName.worktreeId === worktreeId ? worktreeName.name : routeNameHint
}
