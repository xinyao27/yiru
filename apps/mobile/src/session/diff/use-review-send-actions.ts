import type { DiffComment, MobileDiffReviewState } from '@yiru/workbench-model/workspace'
import * as Clipboard from 'expo-clipboard'
import { useCallback, type Dispatch, type SetStateAction } from 'react'

import { triggerSuccess } from '~/platform/haptics'
import type { RpcClient } from '~/transport/rpc-client'
import { callRuntimeOrpc } from '~/transport/runtime-orpc-client'
import type { ConnectionState } from '~/transport/types'

import { clearSentMobileDiffComments, markMobileDiffCommentsSent } from './comment-edit'
import { formatDiffComments, formatMobileDiffReviewPrompt } from './comments'
import {
  readMobileReviewCreatedTerminal,
  readMobileReviewTerminalSendAccepted,
  readMobileReviewTerminalTabs
} from './review-rpc'
import type { ReviewScreenState, SendSheetState } from './review-screen-model'

type SendActionsInput = {
  client: RpcClient | null
  connState: ConnectionState
  worktreeId: string
  screenState: ReviewScreenState
  setActionError: Dispatch<SetStateAction<string | null>>
  setSendSheet: Dispatch<SetStateAction<SendSheetState | null>>
  saveCommentsAndReviewState: (
    comments: DiffComment[],
    reviewState: MobileDiffReviewState
  ) => Promise<void>
}

export function useMobileDiffReviewSendActions(input: SendActionsInput) {
  const {
    client,
    connState,
    worktreeId,
    screenState,
    setActionError,
    setSendSheet,
    saveCommentsAndReviewState
  } = input

  const copyNotes = useCallback(async () => {
    if (screenState.kind !== 'ready' || screenState.comments.length === 0) {
      return
    }
    await Clipboard.setStringAsync(formatDiffComments(screenState.comments))
    triggerSuccess()
    setActionError('Review notes copied')
  }, [screenState, setActionError])

  const clearSentNotes = useCallback(async () => {
    if (screenState.kind !== 'ready') {
      return
    }
    const nextComments = clearSentMobileDiffComments(screenState.comments)
    await saveCommentsAndReviewState(nextComments, screenState.reviewState)
  }, [saveCommentsAndReviewState, screenState])

  const markNotesSent = useCallback(
    async (comments: readonly DiffComment[]) => {
      if (screenState.kind !== 'ready') {
        return
      }
      const next = markMobileDiffCommentsSent(
        screenState.comments,
        new Set(comments.map((comment) => comment.id)),
        Date.now()
      )
      await saveCommentsAndReviewState(next, screenState.reviewState)
    },
    [saveCommentsAndReviewState, screenState]
  )

  const sendPromptToTerminal = useCallback(
    async (terminal: string, comments: readonly DiffComment[]) => {
      if (!client || connState !== 'connected') {
        throw new Error('Waiting for desktop...')
      }
      const response = await callRuntimeOrpc(client, (runtime) => runtime.terminal.send, {
        terminal,
        text: formatMobileDiffReviewPrompt(comments),
        enter: true
      })
      if (!readMobileReviewTerminalSendAccepted(response)) {
        throw new Error('Terminal input is locked')
      }
      await markNotesSent(comments)
      triggerSuccess()
      setActionError('Review notes sent')
      setSendSheet(null)
    },
    [client, connState, markNotesSent, setActionError, setSendSheet]
  )

  const createTerminalAndSend = useCallback(
    async (comments: readonly DiffComment[]) => {
      if (!client || connState !== 'connected') {
        throw new Error('Waiting for desktop...')
      }
      const response = await callRuntimeOrpc(
        client,
        (runtime) => runtime.session.tabs.createTerminal,
        { worktree: `id:${worktreeId}` }
      )
      const created = readMobileReviewCreatedTerminal(response)
      if (!created) {
        throw new Error('Created terminal response was invalid')
      }
      await sendPromptToTerminal(created.terminal, comments)
    },
    [client, connState, sendPromptToTerminal, worktreeId]
  )

  const openSendSheet = useCallback(async () => {
    if (!client || connState !== 'connected') {
      setActionError('Waiting for desktop...')
      return
    }
    setSendSheet({ kind: 'loading' })
    try {
      const response = await callRuntimeOrpc(client, (runtime) => runtime.session.tabs.list, {
        worktree: `id:${worktreeId}`
      })
      setSendSheet({ kind: 'ready', terminals: readMobileReviewTerminalTabs(response) })
    } catch (err) {
      setSendSheet({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unable to load agent sessions',
        terminals: []
      })
    }
  }, [client, connState, setActionError, setSendSheet, worktreeId])

  return {
    clearSentNotes,
    copyNotes,
    createTerminalAndSend,
    openSendSheet,
    sendPromptToTerminal
  }
}
