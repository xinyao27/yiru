import { cn } from '@/style/class-names'

// Styles for the plain-text reply / root-comment composer. Muted/monochrome to
// match the PR comment timeline; split out to keep PRCommentComposer focused.
export const prCommentComposerStyles = {
  // Input → Cancel/Save needs clear separation (title edit was flush without this).
  container: cn('gap-3'),
  input: cn(
    'min-h-16 bg-secondary border-hairline border-border rounded-none px-3 py-2 text-foreground text-[14px]'
  ),
  actions: cn('flex-row justify-end gap-2'),
  cancel: cn('min-h-9 px-3 items-center justify-center rounded-none'),
  cancelText: cn('text-muted-foreground text-[12px] font-semibold'),
  submit: cn('min-h-9 min-w-18 px-3 items-center justify-center rounded-none bg-foreground'),
  submitDisabled: cn('opacity-[0.45]'),
  submitText: cn('text-background text-[12px] font-bold'),
  pressed: cn('opacity-[0.8]'),
  pressedActive: cn('active:opacity-[0.8]'),
  error: cn('text-destructive text-[12px]')
} as const
