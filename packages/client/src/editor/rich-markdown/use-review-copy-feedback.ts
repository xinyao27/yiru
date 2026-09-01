import { useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { shellClient } from '~renderer/runtime/shell-client'

import { copyMarkdownReviewNotesForAgent } from '../markdown-review-note-copy'
import type { MarkdownReviewNote } from '../markdown-review-notes'

type UseRichMarkdownReviewCopyFeedbackOptions = {
  markdownReviewContent: string
  markdownReviewNotes: MarkdownReviewNote[]
  rootRef: MutableRefObject<HTMLDivElement | null>
}

export function useRichMarkdownReviewCopyFeedback({
  markdownReviewContent,
  markdownReviewNotes,
  rootRef
}: UseRichMarkdownReviewCopyFeedbackOptions) {
  const [reviewNotesCopied, setReviewNotesCopied] = useState(false)
  const [copiedReviewNoteId, setCopiedReviewNoteId] = useState<string | null>(null)
  const reviewNotesCopiedResetTimerRef = useRef<number | null>(null)
  const copiedReviewNoteResetTimerRef = useRef<number | null>(null)

  const clearReviewCopyTimers = (): void => {
    clearWindowTimer(reviewNotesCopiedResetTimerRef)
    clearWindowTimer(copiedReviewNoteResetTimerRef)
  }

  const handleCopyMarkdownReviewNotes = async (): Promise<void> => {
    const copied = await copyReviewNotes(markdownReviewNotes, markdownReviewContent)
    if (copied && rootRef.current) {
      clearReviewCopyTimers()
      setCopiedReviewNoteId(null)
      setReviewNotesCopied(true)
      reviewNotesCopiedResetTimerRef.current = window.setTimeout(() => {
        reviewNotesCopiedResetTimerRef.current = null
        setReviewNotesCopied(false)
      }, 1600)
    }
  }

  const handleCopyMarkdownReviewNote = async (note: MarkdownReviewNote): Promise<void> => {
    const copied = await copyReviewNotes([note], markdownReviewContent)
    if (copied && rootRef.current) {
      clearWindowTimer(copiedReviewNoteResetTimerRef)
      setCopiedReviewNoteId(note.id)
      copiedReviewNoteResetTimerRef.current = window.setTimeout(() => {
        copiedReviewNoteResetTimerRef.current = null
        setCopiedReviewNoteId(null)
      }, 1600)
    }
  }

  return {
    clearReviewCopyTimers,
    copiedReviewNoteId,
    handleCopyMarkdownReviewNote,
    handleCopyMarkdownReviewNotes,
    reviewNotesCopied
  }
}

function clearWindowTimer(ref: MutableRefObject<number | null>): void {
  if (ref.current !== null) {
    window.clearTimeout(ref.current)
    ref.current = null
  }
}

async function copyReviewNotes(notes: MarkdownReviewNote[], content: string): Promise<boolean> {
  try {
    return await copyMarkdownReviewNotesForAgent({
      notes,
      content,
      writeClipboardText: shellClient.ui.writeClipboardText
    })
  } catch {
    return false
  }
}
