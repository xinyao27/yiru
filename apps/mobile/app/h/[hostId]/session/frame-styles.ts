import { cn } from '@/style/class-names'

export const mobileSessionFrameStyles = {
  newTerminalButton: cn('w-10 h-9 items-center justify-center border-b-2 border-b-transparent'),
  newTerminalButtonDisabled: cn('opacity-[0.45]'),
  markdownFrame: cn('flex-1 min-h-0 bg-background'),
  markdownEditor: cn('flex-1 relative'),
  markdownState: cn('flex-1 items-center justify-center p-6 gap-3'),
  markdownError: cn('text-destructive text-sm')
} as const
