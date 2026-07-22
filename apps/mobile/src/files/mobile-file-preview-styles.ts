import { cn } from '@/style/class-names'

export const filePreviewStyles = {
  container: cn('flex-1 bg-background'),
  header: cn('bg-card border-b-hairline border-b-border'),
  topBar: cn('min-h-[58px] flex-row items-center gap-3 px-3'),
  backButton: cn('w-9 h-9 items-center justify-center rounded-none'),
  backButtonPressed: cn('bg-secondary'),
  backButtonPressedActive: cn('active:bg-secondary'),
  titleBlock: cn('flex-1 min-w-0'),
  title: cn('text-foreground text-[18px] font-semibold'),
  meta: cn('mt-[2px] text-muted-foreground text-[12px]'),
  state: cn('flex-1 items-center justify-center gap-3 p-6'),
  stateText: cn('text-muted-foreground text-[14px] text-center'),
  errorText: cn('text-destructive text-[14px] text-center'),
  retryButton: cn(
    'min-h-9 items-center justify-center rounded-none border-hairline border-border px-4'
  ),
  retryText: cn('text-foreground text-[14px] font-semibold'),
  saveButton: cn('w-9 h-9 items-center justify-center rounded-none bg-secondary'),
  saveButtonDisabled: cn('opacity-[0.42]'),
  scroll: cn('flex-1 bg-[var(--editor-surface)]'),
  textContent: cn('p-3 pb-6'),
  textPreview: cn('text-foreground font-mono text-[13px] leading-[19px]'),
  markdownContent: cn('p-3 pb-6'),
  modeContainer: cn('flex-1 bg-[var(--editor-surface)]'),
  modeToolbar: cn(
    'flex-row self-start mx-3 my-2 p-[1px] border-hairline border-border rounded-none bg-card'
  ),
  modeToggle: cn(
    'w-[34px] h-7 items-center justify-center rounded-none bg-transparent opacity-[0.72]'
  ),
  modeToggleActive: cn('bg-secondary opacity-[1]'),
  truncatedNote: cn('mb-3 text-muted-foreground text-[12px]'),
  imageContainer: cn('flex-1 bg-[var(--editor-surface)]'),
  imageScrollContent: cn('grow items-center justify-center p-3'),
  image: cn('bg-[var(--editor-surface)]'),
  editContainer: cn('flex-1 bg-[var(--editor-surface)] p-3'),
  saveErrorText: cn('mb-2 text-destructive text-[12px]'),
  editInput: cn('flex-1 text-foreground font-mono text-[13px] leading-[19px] p-0')
} as const
