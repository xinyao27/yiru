import { cn } from '@/style/class-names'

export const mobileSessionReaderStyles = {
  markdownTextInput: cn(
    'flex-1 min-h-0 text-foreground bg-background px-4 pt-4 pb-18 text-[14px] leading-[22px] font-mono'
  ),
  filePreviewScroll: cn('flex-1 min-h-0 bg-[var(--editor-surface)]'),
  filePreviewContent: cn('px-4 pt-4 pb-6'),
  filePreviewText: cn('text-foreground text-[14px] leading-[22px] font-mono'),
  imagePreviewContainer: cn('flex-1 min-h-0 bg-[var(--editor-surface)]'),
  imagePreviewScroll: cn('flex-1'),
  imagePreviewContent: cn('grow items-center justify-center p-4'),
  imagePreview: cn('w-full h-full min-h-50'),
  diffNotesToolbar: cn(
    'flex-row items-center justify-between gap-2 px-4 py-2 border-b-hairline border-b-border bg-card'
  ),
  diffNotesTitleRow: cn('min-w-0 flex-1 flex-row items-center gap-1'),
  diffNotesTitle: cn('text-muted-foreground text-[12px] font-semibold'),
  diffNotesActions: cn('flex-row items-center gap-1'),
  diffNotesActionButton: cn(
    'min-h-[30px] flex-row items-center gap-1 border border-border rounded-none px-2 bg-secondary'
  ),
  diffNotesActionText: cn('text-muted-foreground text-[12px] font-semibold'),
  diffLineBlock: cn('mb-1'),
  diffLine: cn('flex-row items-start border-l-2 border-l-[var(--editor-surface)] pr-2'),
  diffLineAdded: cn(
    'bg-[var(--editor-diff-inserted-line-background)] border-l-[var(--git-decoration-added)]'
  ),
  diffLineDeleted: cn(
    'bg-[var(--editor-diff-removed-line-background)] border-l-[var(--git-decoration-deleted)]'
  ),
  diffGutter: cn(
    'w-[42px] pr-2 text-right text-muted-foreground/60 text-[12px] leading-[22px] font-mono'
  ),
  diffText: cn('flex-1 text-foreground text-[14px] leading-[22px] font-mono'),
  diffPrefix: cn('text-muted-foreground/60'),
  diffPrefixAdded: cn('text-[var(--git-decoration-added)]'),
  diffPrefixDeleted: cn('text-[var(--git-decoration-deleted)]')
} as const
