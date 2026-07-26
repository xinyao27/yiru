import { cn } from '@/style/class-names'

export const mobileSessionCommandInputStyles = {
  emptyState: cn('flex-1 items-center justify-center p-6'),
  emptyText: cn('text-muted-foreground text-sm mb-4'),
  accessoryKey: cn('min-w-9 items-center rounded-lg bg-secondary px-2.5 py-1'),
  accessoryKeyDisabled: cn('opacity-40'),
  accessoryKeyText: cn('text-muted-foreground text-xs font-mono'),
  accessoryKeyTextDisabled: cn('text-muted-foreground'),
  inputBar: cn('min-h-12 flex-row items-center px-3 py-1.5'),
  textInput: cn(
    'bg-secondary text-foreground mr-2 h-9 flex-1 rounded-xl px-3 py-0 font-mono text-sm'
  ),
  inputActionButton: cn(
    'mr-2 h-9 w-9 items-center justify-center rounded-xl border border-transparent bg-secondary'
  ),
  sendButtonDisabled: cn('opacity-40')
} as const
