export const sessionScreenClassNames = {
  emptyState: 'flex-1 items-center justify-center p-6',
  emptyText: 'mb-4 text-sm text-muted-foreground',
  markdownFrame: 'min-h-0 flex-1 bg-background',
  markdownEditor: 'relative flex-1',
  markdownState: 'flex-1 items-center justify-center gap-3 p-6',
  markdownError: 'text-sm text-destructive',
  filePreviewScroll: 'min-h-0 flex-1 bg-editor-surface',
  filePreviewContent: 'px-4 pt-4 pb-6',
  diffNotesActionButton:
    'min-h-8 flex-row items-center gap-1 rounded-lg border border-border bg-secondary px-2',
  diffNotesActionText: 'text-xs font-semibold text-muted-foreground',
  diffCommentButtonDisabled: 'opacity-50',
  markdownFloatingButton:
    'min-h-9 flex-row items-center gap-1 rounded-xl border border-border bg-card px-3 py-1',
  markdownFloatingButtonText: 'text-xs font-semibold text-foreground',
  toast: 'absolute right-0 bottom-4 left-0 items-center self-center',
  toastText:
    'overflow-hidden rounded-xl border-hairline border-border bg-secondary px-4 py-2 text-xs text-foreground'
} as const
