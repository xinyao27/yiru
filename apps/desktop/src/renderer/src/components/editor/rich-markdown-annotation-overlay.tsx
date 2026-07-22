import { Plus } from '@/components/regular-icons'
import { translate } from '@/i18n/i18n'

import { DiffCommentPopover } from '../diff-comments/diff-comment-popover'
import type { RichMarkdownAnnotationTarget } from './rich-markdown-review-annotations'

type RichMarkdownAnnotationOverlayProps = {
  target: RichMarkdownAnnotationTarget | null
  popover: RichMarkdownAnnotationTarget | null
  markdownSourceLineOffset: number
  onOpenPopover: () => void
  onCancelPopover: () => void
  onSubmit: (body: string) => Promise<void>
}

export function RichMarkdownAnnotationOverlay({
  target,
  popover,
  markdownSourceLineOffset,
  onOpenPopover,
  onCancelPopover,
  onSubmit
}: RichMarkdownAnnotationOverlayProps): React.JSX.Element {
  return (
    <>
      {target ? (
        <button
          type="button"
          className="yiru-diff-comment-add-btn rich-markdown-comment-add-btn focus-visible:bg-accent outline-none"
          style={{
            top: target.buttonTop ?? 56,
            left: target.buttonLeft ?? 16
          }}
          title={translate(
            'auto.components.editor.RichMarkdownAnnotationOverlay.6f2f3a6001',
            'Add review note'
          )}
          aria-label={translate(
            'auto.components.editor.RichMarkdownAnnotationOverlay.6f2f3a6001',
            'Add review note'
          )}
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onOpenPopover()
          }}
        >
          <Plus className="size-3.5" strokeWidth={2.5} />
        </button>
      ) : null}
      {popover ? (
        <DiffCommentPopover
          key={`${popover.startLine ?? popover.lineNumber}:${popover.lineNumber}`}
          lineNumber={popover.lineNumber + markdownSourceLineOffset}
          startLine={
            popover.startLine === undefined
              ? undefined
              : popover.startLine + markdownSourceLineOffset
          }
          top={popover.top}
          left={popover.left}
          title={translate(
            'auto.components.editor.RichMarkdownAnnotationOverlay.069b5677b8',
            'Selected text'
          )}
          onCancel={onCancelPopover}
          onSubmit={onSubmit}
        />
      ) : null}
    </>
  )
}
