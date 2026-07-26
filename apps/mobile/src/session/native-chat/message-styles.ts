import { cn } from '../../style/class-names'

export const TEXT_SIZE = 17
export const MONO_SIZE = 12
export const MAX_TOOL_RESULT_CHARS = 4000

export const styles = {
  controlButton: cn('p-[3px]'),
  controlPressedActive: cn('active:bg-accent'),

  toolPreview: cn('flex-1 text-muted-foreground/60 font-mono text-xs'),

  mono: cn('text-muted-foreground font-mono text-xs leading-[17px]')
} as const
