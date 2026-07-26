import { cn } from '@/style/class-names'

// Styles for the plain-text reply / root-comment composer. Muted/monochrome to
// match the PR comment timeline; split out to keep PRCommentComposer focused.
export const prCommentComposerStyles = {
  // Input → Cancel/Save needs clear separation (title edit was flush without this).
  container: cn('gap-3'),
  input: cn(
    'border-hairline border-border bg-secondary text-foreground min-h-16 rounded-xl px-3 py-2 text-sm'
  ),
  actions: cn('flex-row justify-end gap-2'),
  cancel: cn('min-h-9 items-center justify-center rounded-xl px-3'),
  cancelText: cn('text-muted-foreground text-xs font-semibold'),
  submit: cn('min-h-9 min-w-18 items-center justify-center rounded-xl bg-primary px-3'),

  submitText: cn('text-primary-foreground text-xs font-bold'),
  pressedActive: cn('active:bg-accent')
} as const
