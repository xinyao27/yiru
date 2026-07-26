import { cn } from '@/style/class-names'

export const mobileSessionFrameStyles = {
  newTerminalButton: cn('h-10 w-10 items-center justify-center rounded-xl'),
  newTerminalButtonDisabled: cn('opacity-[0.45]'),
  markdownFrame: cn('flex-1 min-h-0 bg-background'),
  markdownEditor: cn('flex-1 relative'),
  markdownState: cn('flex-1 items-center justify-center p-6 gap-3'),
  markdownError: cn('text-destructive text-sm')
} as const
