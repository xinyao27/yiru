import { cn } from '@/style/class-names'

export const mobileSessionCommandInputStyles = {
  createWarningBanner: cn(
    'flex-row items-start gap-2 bg-card border-b-hairline border-b-border px-3 py-2'
  ),
  createWarningText: cn('flex-1 text-foreground text-[12px] leading-[16px]'),
  createWarningDismiss: cn('w-6 h-6 items-center justify-center mt-[-4px]'),
  emptyState: cn('flex-1 items-center justify-center p-6'),
  emptyText: cn('text-muted-foreground text-[14px] mb-4'),
  createError: cn('text-destructive text-[13px] mb-2'),
  emptyActions: cn('flex-row flex-wrap justify-center gap-2'),
  createButton: cn('bg-secondary border border-border px-6 py-2.5 rounded-none'),
  createButtonDisabled: cn('opacity-[0.5]'),
  createButtonText: cn('text-foreground text-[14px] font-semibold'),
  commandDock: cn('z-[20]'),
  accessoryBar: cn('flex-row items-center border-t border-t-border bg-card'),
  accessoryScroll: cn('flex-1 min-w-0'),
  accessoryContent: cn('px-2 py-1 gap-1'),
  accessoryKey: cn('bg-secondary px-2.5 py-1 rounded-none min-w-9 items-center'),
  accessoryKeyPressed: cn('bg-border'),
  accessoryKeyActive: cn('bg-foreground'),
  customAccessoryKey: cn('border border-border'),
  accessoryKeyDisabled: cn('opacity-[0.35]'),
  accessoryKeyText: cn('text-muted-foreground text-[12px] font-mono'),
  accessoryKeyTextActive: cn('text-background font-bold'),
  accessoryKeyTextDisabled: cn('text-muted-foreground/60'),
  keyboardDismissKey: cn(
    'items-center justify-center ml-2 my-1 bg-secondary px-2.5 py-0 rounded-none min-w-9 h-7'
  ),
  keyboardDismissGlyph: cn('items-center h-[18px] justify-start relative w-[18px]'),
  keyboardDismissChevron: cn('bottom-[-2px] absolute'),
  inputBar: cn('flex-row items-center min-h-[46px] py-1.5 px-3 border-t border-t-border bg-card'),
  textInput: cn(
    'flex-1 h-[34px] bg-secondary text-foreground rounded-none px-3 py-0 text-[14px] font-mono mr-2'
  ),
  liveInputBar: cn('gap-2'),
  liveInputFocusTarget: cn(
    'flex-1 min-h-[34px] flex-row items-center gap-2 bg-secondary border border-border rounded-none px-2.5'
  ),
  liveInputFocusTargetPressed: cn('bg-border'),
  liveInputFocusTargetDisabled: cn('opacity-[0.45]'),
  liveInputCapture: cn('absolute opacity-[0] w-[1px] h-[1px] text-foreground'),
  sendButton: cn('bg-secondary w-[34px] h-[34px] rounded-none items-center justify-center'),
  dictationButton: cn(
    'bg-secondary w-[34px] h-[34px] rounded-none border border-transparent items-center justify-center mr-2'
  ),
  dictationButtonActive: cn('bg-card border-muted-foreground'),
  sendButtonDisabled: cn('opacity-[0.35]')
} as const
