import type { DiffComment } from '@yiru/workbench-model/workspace'
import * as Clipboard from 'expo-clipboard'
import { useCallback, useEffect, useRef, useState } from 'react'

import { triggerError, triggerSelection, triggerSuccess } from '~/platform/haptics'
import type { RpcClient } from '~/transport/rpc-client'
import type { ConnectionState } from '~/transport/types'

import {
  addMobileDiffComment,
  formatDiffComments,
  normalizeMobileDiffComments,
  removeDeliveredMobileDiffComments,
  removeMobileDiffComments
} from './diff/comments'
import type { DiffNotesDelivery } from './screen-state'

export type MobileDiffCommentsDeps = {
  client: RpcClient | null
  connState: ConnectionState
  worktreeId: string
  isFloatingWorkspaceRoute: boolean
  showToast: (message: string, durationMs?: number) => void
}

export type MobileDiffComments = {
  diffComments: DiffComment[]
  setDiffComments: React.Dispatch<React.SetStateAction<DiffComment[]>>
  diffCommentBusy: boolean
  pendingDiffNotesDelivery: DiffNotesDelivery | null
  setPendingDiffNotesDelivery: React.Dispatch<React.SetStateAction<DiffNotesDelivery | null>>
  addDiffCommentForFile: (filePath: string, lineNumber: number, body: string) => Promise<boolean>
  deleteDiffCommentForFile: (commentId: string) => Promise<void>
  copyDiffCommentsToClipboard: () => Promise<void>
  sendDiffCommentsToAgent: () => void
  clearDeliveredDiffComments: (delivered: readonly DiffComment[]) => Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Owns the worktree review notes shown on mobile diff previews: the host-persisted
// comment list, the optimistic-write busy flag, and the pending "send to agent"
// hand-off. Clearing on route change stays with the screen so a transient
// disconnect keeps the last-known notes visible.
export function useMobileDiffComments(deps: MobileDiffCommentsDeps): MobileDiffComments {
  const { client, connState, worktreeId, isFloatingWorkspaceRoute, showToast } = deps
  const [diffComments, setDiffComments] = useState<DiffComment[]>([])
  // Why: optimistic writes roll back to the pre-write list from an async
  // callback, so they need the latest value rather than their captured render's.
  const diffCommentsRef = useRef<DiffComment[]>([])
  const [diffCommentBusy, setDiffCommentBusy] = useState(false)
  const [pendingDiffNotesDelivery, setPendingDiffNotesDelivery] =
    useState<DiffNotesDelivery | null>(null)

  useEffect(() => {
    diffCommentsRef.current = diffComments
  }, [diffComments])

  const loadDiffComments = useCallback(async (): Promise<void> => {
    // Why: keep the last-known review notes through a transient disconnect (the
    // route-change effect owns clearing them) and refetch once reconnected.
    if (!client || connState !== 'connected' || !worktreeId || isFloatingWorkspaceRoute) {
      return
    }
    const response = await client.sendRequest('worktree.show', {
      worktree: `id:${worktreeId}`
    })
    if (!response.ok) {
      return
    }
    // Why: worktree.show answers with an unknown payload; normalizeMobileDiffComments
    // validates each note itself, so only the two nesting levels need narrowing here.
    const worktree = isRecord(response.result) ? response.result.worktree : undefined
    const rawComments = isRecord(worktree) ? worktree.diffComments : undefined
    setDiffComments(normalizeMobileDiffComments(rawComments, worktreeId))
  }, [client, connState, isFloatingWorkspaceRoute, worktreeId])

  const persistDiffComments = useCallback(
    async (comments: readonly DiffComment[]): Promise<void> => {
      if (!client || connState !== 'connected') {
        throw new Error('Waiting for desktop...')
      }
      const response = await client.sendRequest('worktree.set', {
        worktree: `id:${worktreeId}`,
        diffComments: comments
      })
      if (!response.ok) {
        throw new Error(response.error.message || 'Failed to save review notes')
      }
    },
    [client, connState, worktreeId]
  )

  useEffect(() => {
    void loadDiffComments()
  }, [loadDiffComments])

  const addDiffCommentForFile = useCallback(
    async (filePath: string, lineNumber: number, body: string): Promise<boolean> => {
      if (diffCommentBusy) {
        return false
      }
      const nextId = `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      const result = addMobileDiffComment(diffCommentsRef.current, {
        id: nextId,
        worktreeId,
        filePath,
        lineNumber,
        body,
        createdAt: Date.now()
      })
      if (!result.comment) {
        return false
      }
      const previous = diffCommentsRef.current
      setDiffCommentBusy(true)
      setDiffComments(result.comments)
      try {
        await persistDiffComments(result.comments)
        triggerSuccess()
        showToast('Note added')
        return true
      } catch (err) {
        setDiffComments(previous)
        triggerError()
        showToast(err instanceof Error ? err.message : 'Failed to save note', 1600)
        return false
      } finally {
        setDiffCommentBusy(false)
      }
    },
    [diffCommentBusy, persistDiffComments, showToast, worktreeId]
  )

  const deleteDiffCommentForFile = useCallback(
    async (commentId: string): Promise<void> => {
      if (diffCommentBusy) {
        return
      }
      const previous = diffCommentsRef.current
      const next = removeMobileDiffComments(previous, new Set([commentId]))
      if (next.length === previous.length) {
        return
      }
      setDiffCommentBusy(true)
      setDiffComments(next)
      try {
        await persistDiffComments(next)
        triggerSelection()
      } catch (err) {
        setDiffComments(previous)
        triggerError()
        showToast(err instanceof Error ? err.message : 'Failed to delete note', 1600)
      } finally {
        setDiffCommentBusy(false)
      }
    },
    [diffCommentBusy, persistDiffComments, showToast]
  )

  const copyDiffCommentsToClipboard = useCallback(async (): Promise<void> => {
    const comments = diffCommentsRef.current
    if (comments.length === 0) {
      return
    }
    try {
      await Clipboard.setStringAsync(formatDiffComments(comments))
      triggerSuccess()
      showToast('Notes copied')
    } catch {
      triggerError()
      showToast("Couldn't copy notes", 1600)
    }
  }, [showToast])

  const sendDiffCommentsToAgent = useCallback((): void => {
    const comments = diffCommentsRef.current.filter((comment) => !comment.sentAt)
    if (comments.length === 0) {
      return
    }
    setPendingDiffNotesDelivery({
      comments: [...comments],
      prompt: formatDiffComments(comments)
    })
  }, [])

  const clearDeliveredDiffComments = useCallback(
    async (delivered: readonly DiffComment[]): Promise<void> => {
      const previous = diffCommentsRef.current
      const next = removeDeliveredMobileDiffComments(previous, delivered)
      if (next.length === previous.length) {
        return
      }
      setDiffCommentBusy(true)
      setDiffComments(next)
      try {
        await persistDiffComments(next)
      } catch {
        setDiffComments(previous)
      } finally {
        setDiffCommentBusy(false)
      }
    },
    [persistDiffComments]
  )

  return {
    diffComments,
    setDiffComments,
    diffCommentBusy,
    pendingDiffNotesDelivery,
    setPendingDiffNotesDelivery,
    addDiffCommentForFile,
    deleteDiffCommentForFile,
    copyDiffCommentsToClipboard,
    sendDiffCommentsToAgent,
    clearDeliveredDiffComments
  }
}
