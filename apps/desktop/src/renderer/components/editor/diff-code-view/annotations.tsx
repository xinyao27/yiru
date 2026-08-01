import type { SelectedLineRange } from '@pierre/diffs'
import type { DiffLineAnnotation } from '@pierre/diffs/react'
import type { DecoratedDiffComment } from '~renderer/components/diff-comments/use-diff-comment-decorator'

import { PierreDiffCommentAnnotation } from '../pierre-diff-comment-annotation'
import { PierreDiffCommentComposer } from '../pierre-diff-comment-composer'

/** An open, unsaved comment anchored to a line or line range. */
export type DiffCodeViewComposer = {
  lineNumber: number
  startLine?: number
}

export type DiffCodeViewAnnotation =
  | { kind: 'comment'; comment: DecoratedDiffComment }
  | { kind: 'composer'; composer: DiffCodeViewComposer }

export type DiffCodeViewAnnotationHandlers = {
  relativePath: string
  worktreeId?: string
  addLineCommentLabel?: string
  addLineCommentPlaceholder?: string
  onCancelComposer: () => void
  onSubmitComposer: (body: string) => Promise<void>
  onDeleteComment?: (commentId: string) => void
  onUpdateComment?: (commentId: string, body: string) => Promise<boolean>
}

/**
 * Comments only attach to the new side, so a selection that reaches into
 * deletions — or outside the lines this diff actually rendered — cannot anchor.
 */
export function isCommentableRange(
  range: SelectedLineRange,
  commentableLineNumbers: readonly number[] | undefined
): boolean {
  if (
    (range.side && range.side !== 'additions') ||
    (range.endSide && range.endSide !== 'additions')
  ) {
    return false
  }
  if (!commentableLineNumbers) {
    return true
  }
  const allowed = new Set(commentableLineNumbers)
  const start = Math.min(range.start, range.end)
  const end = Math.max(range.start, range.end)
  for (let line = start; line <= end; line += 1) {
    if (!allowed.has(line)) {
      return false
    }
  }
  return true
}

export function buildDiffCodeViewAnnotations(
  comments: readonly DecoratedDiffComment[],
  composer: DiffCodeViewComposer | null
): DiffLineAnnotation<DiffCodeViewAnnotation>[] {
  const annotations: DiffLineAnnotation<DiffCodeViewAnnotation>[] = comments.map((comment) => ({
    side: 'additions' as const,
    lineNumber: comment.lineNumber,
    metadata: { kind: 'comment' as const, comment }
  }))
  if (composer) {
    annotations.push({
      side: 'additions',
      lineNumber: composer.lineNumber,
      metadata: { kind: 'composer', composer }
    })
  }
  return annotations
}

export function renderDiffCodeViewAnnotation(
  annotation: DiffLineAnnotation<DiffCodeViewAnnotation>,
  handlers: DiffCodeViewAnnotationHandlers
): React.JSX.Element {
  const metadata = annotation.metadata
  if (metadata.kind === 'composer') {
    return (
      <PierreDiffCommentComposer
        {...metadata.composer}
        placeholder={handlers.addLineCommentPlaceholder}
        submitLabel={handlers.addLineCommentLabel}
        submittingLabel="Posting…"
        onCancel={handlers.onCancelComposer}
        onSubmit={handlers.onSubmitComposer}
      />
    )
  }
  return (
    <PierreDiffCommentAnnotation
      comment={metadata.comment}
      relativePath={handlers.relativePath}
      worktreeId={handlers.worktreeId}
      onDeleteComment={handlers.onDeleteComment}
      onUpdateComment={handlers.onUpdateComment}
    />
  )
}
