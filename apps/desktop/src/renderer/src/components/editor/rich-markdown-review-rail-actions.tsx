import { Check, Copy, Chat as MessageSquare } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { MarkdownReviewNote } from '@/lib/markdown-review-notes'

import { NotesSendMenu, type NotesSendMenuScope } from './notes-send-menu'

type RichMarkdownReviewRailActionsProps = {
  worktreeId: string
  filePath: string
  noteCount: number
  railOpen: boolean
  notesCopied: boolean
  unsentScope: NotesSendMenuScope<MarkdownReviewNote>[]
  onToggleRail: () => void
  onCopyNotes: () => void
  onDelivered: (notes: readonly MarkdownReviewNote[]) => void
}

export function RichMarkdownReviewRailActions({
  worktreeId,
  filePath,
  noteCount,
  railOpen,
  notesCopied,
  unsentScope,
  onToggleRail,
  onCopyNotes,
  onDelivered
}: RichMarkdownReviewRailActionsProps): React.JSX.Element {
  return (
    <div className="rich-markdown-review-rail-actions">
      <Button
        variant="ghost"
        size="xs"
        type="button"
        className="rich-markdown-review-rail-toggle focus-visible:bg-accent h-auto border-0 p-0"
        aria-label={
          railOpen
            ? translate(
                'auto.components.editor.RichMarkdownReviewRailActions.af02dc2456',
                'Hide review notes'
              )
            : translate(
                'auto.components.editor.RichMarkdownReviewRailActions.8aaf2c4c69',
                'Show review notes'
              )
        }
        aria-expanded={railOpen}
        title={
          railOpen
            ? translate(
                'auto.components.editor.RichMarkdownReviewRailActions.af02dc2456',
                'Hide review notes'
              )
            : translate(
                'auto.components.editor.RichMarkdownReviewRailActions.8aaf2c4c69',
                'Show review notes'
              )
        }
        onClick={onToggleRail}
      >
        <MessageSquare className="size-3.5" />
        <span>{noteCount}</span>
      </Button>
      <Button
        variant="ghost"
        size="xs"
        type="button"
        className="rich-markdown-review-rail-action focus-visible:bg-accent h-auto border-0 p-0"
        title={
          notesCopied
            ? translate(
                'auto.components.editor.RichMarkdownReviewRailActions.a807596997',
                'Copied notes'
              )
            : translate(
                'auto.components.editor.RichMarkdownReviewRailActions.636394af72',
                'Copy notes for agent'
              )
        }
        aria-label={
          notesCopied
            ? translate(
                'auto.components.editor.RichMarkdownReviewRailActions.a807596997',
                'Copied notes'
              )
            : translate(
                'auto.components.editor.RichMarkdownReviewRailActions.636394af72',
                'Copy notes for agent'
              )
        }
        onClick={onCopyNotes}
      >
        {notesCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </Button>
      <NotesSendMenu
        worktreeId={worktreeId}
        groupId={worktreeId}
        modeIdParts={['markdown-notes', worktreeId, filePath, 'rail']}
        scopes={unsentScope}
        triggerClassName="rich-markdown-review-rail-action"
        onDelivered={onDelivered}
      />
    </div>
  )
}
