import { cn } from '@/style/class-names'

export const mobileSessionCommandInputStyles = {
  emptyState: cn('flex-1 items-center justify-center p-6'),
  emptyText: cn('text-muted-foreground text-sm mb-4'),
  accessoryKey: cn('bg-secondary px-2.5 py-1 min-w-9 items-center'),
  accessoryKeyDisabled: cn('opacity-[0.35]'),
  accessoryKeyText: cn('text-muted-foreground text-xs font-mono'),
  accessoryKeyTextDisabled: cn('text-muted-foreground/60'),
  inputBar: cn('flex-row items-center min-h-[46px] py-1.5 px-3 border-t border-t-border bg-card'),
  textInput: cn('flex-1 h-[34px] bg-secondary text-foreground px-3 py-0 text-sm font-mono mr-2'),
  inputActionButton: cn(
    'bg-secondary w-[34px] h-[34px] border border-transparent items-center justify-center mr-2'
  ),
  sendButtonDisabled: cn('opacity-[0.35]')
} as const
