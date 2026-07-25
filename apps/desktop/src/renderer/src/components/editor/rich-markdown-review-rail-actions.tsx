import { Check, Copy, Chat as MessageSquare } from '@phosphor-icons/react'

import type { MarkdownReviewNote } from '@/components/editor/markdown-review-notes'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

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
    <div className="absolute top-3 right-3.5 z-[45] inline-flex items-center gap-1">
      <Button
        variant="quiet"
        size="xs"
        type="button"
        className="bg-background aria-expanded:bg-accent aria-expanded:text-foreground inline-flex h-[26px] items-center justify-center gap-[5px] border border-[color-mix(in_srgb,var(--border)_76%,transparent)] px-2 text-[11px] font-semibold"
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
        variant="quiet"
        size="xs"
        type="button"
        className="bg-background inline-flex h-[26px] w-[26px] items-center justify-center border border-[color-mix(in_srgb,var(--border)_76%,transparent)] p-0 disabled:cursor-default disabled:opacity-45"
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
        triggerClassName="inline-flex h-[26px] w-[26px] items-center justify-center border border-[color-mix(in_srgb,var(--border)_76%,transparent)] bg-background p-0 disabled:cursor-default disabled:opacity-45"
        onDelivered={onDelivered}
      />
    </div>
  )
}
