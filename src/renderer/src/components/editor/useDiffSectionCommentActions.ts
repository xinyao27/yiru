import { useCallback } from 'react'
import type { DecoratedDiffComment } from '../diff-comments/useDiffCommentDecorator'
import type { DiffSection } from './diff-section-types'
import { submitDiffSectionComment } from './diff-section-comment-submit'

type SubmitCommentArgs = Parameters<typeof submitDiffSectionComment>[0]

export type PierreDiffSectionCommentProps = {
  worktreeId?: string
  comments: readonly DecoratedDiffComment[]
  commentableLineNumbers?: readonly number[]
  pendingScrollCommentId?: string | null
  onPendingScrollCommentConsumed: () => void
  onAddLineComment?: (args: {
    lineNumber: number
    startLine?: number
    body: string
  }) => Promise<boolean>
  onDeleteComment?: (commentId: string) => void
  onUpdateComment?: (commentId: string, body: string) => Promise<boolean>
  onHeightChange: (height: number) => void
}

export function useDiffSectionCommentActions({
  addDiffComment,
  deleteDiffComment,
  diffComments,
  getCommentableLineNumbers,
  index,
  inlineComments,
  onAddLineComment,
  pendingScrollCommentId,
  popover,
  section,
  setPopover,
  setScrollToDiffCommentId,
  setSectionHeights,
  updateDiffComment,
  worktreeId
}: {
  addDiffComment: SubmitCommentArgs['addDiffComment']
  deleteDiffComment: (worktreeId: string, commentId: string) => Promise<unknown>
  diffComments: readonly DecoratedDiffComment[]
  getCommentableLineNumbers?: (section: DiffSection) => readonly number[] | undefined
  index: number
  inlineComments?: readonly DecoratedDiffComment[]
  onAddLineComment?: SubmitCommentArgs['onAddLineComment']
  pendingScrollCommentId?: string | null
  popover: { lineNumber: number; startLine?: number } | null
  section: DiffSection
  setPopover: (popover: null) => void
  setScrollToDiffCommentId: (commentId: string | null) => void
  setSectionHeights: React.Dispatch<React.SetStateAction<Record<number, number>>>
  updateDiffComment: (worktreeId: string, commentId: string, body: string) => Promise<boolean>
  worktreeId?: string
}): {
  onSubmitComment: (body: string) => Promise<void>
  pierreProps: PierreDiffSectionCommentProps
} {
  const submitComment = useCallback(
    (target: { lineNumber: number; startLine?: number }, body: string) =>
      submitDiffSectionComment({
        addDiffComment,
        body,
        onAddLineComment,
        popover: target,
        section,
        worktreeId
      }),
    [addDiffComment, onAddLineComment, section, worktreeId]
  )
  const onSubmitComment = useCallback(
    async (body: string) => {
      if (popover && (await submitComment(popover, body))) {
        setPopover(null)
      }
    },
    [popover, setPopover, submitComment]
  )
  const onDeleteComment = useCallback(
    (commentId: string) => {
      if (worktreeId) {
        void deleteDiffComment(worktreeId, commentId)
      }
    },
    [deleteDiffComment, worktreeId]
  )
  const onUpdateComment = useCallback(
    (commentId: string, body: string) =>
      worktreeId ? updateDiffComment(worktreeId, commentId, body) : Promise.resolve(false),
    [updateDiffComment, worktreeId]
  )
  const onHeightChange = useCallback(
    (height: number) => {
      setSectionHeights((previous) =>
        previous[index] === height ? previous : { ...previous, [index]: height }
      )
    },
    [index, setSectionHeights]
  )

  return {
    onSubmitComment,
    pierreProps: {
      worktreeId,
      comments: inlineComments ?? (worktreeId ? diffComments : []),
      commentableLineNumbers: getCommentableLineNumbers?.(section),
      pendingScrollCommentId,
      onPendingScrollCommentConsumed: () => setScrollToDiffCommentId(null),
      onAddLineComment:
        worktreeId || onAddLineComment ? (args) => submitComment(args, args.body) : undefined,
      onDeleteComment: worktreeId ? onDeleteComment : undefined,
      onUpdateComment: worktreeId ? onUpdateComment : undefined,
      onHeightChange
    }
  }
}
