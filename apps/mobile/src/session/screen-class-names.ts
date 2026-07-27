export const sessionScreenClassNames = {
  emptyState: 'flex-1 items-center justify-center p-6',
  emptyText: 'mb-4 text-sm text-muted-foreground',
  accessoryKey: 'min-w-9 items-center justify-center rounded-lg bg-secondary px-2.5 py-1',
  accessoryKeyDisabled: 'opacity-40',
  accessoryKeyText: 'font-mono text-xs text-muted-foreground',
  accessoryKeyTextDisabled: 'text-muted-foreground',
  inputBar: 'min-h-12 flex-row items-center px-3 py-1.5',
  textInput: 'mr-2 h-9 flex-1 rounded-xl bg-secondary px-3 py-0 font-mono text-sm text-foreground',
  inputActionButton:
    'mr-2 h-9 w-9 items-center justify-center rounded-xl border border-transparent bg-secondary',
  sendButtonDisabled: 'opacity-40',
  newTerminalButton: 'h-10 w-10 items-center justify-center rounded-xl',
  newTerminalButtonDisabled: 'opacity-50',
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
