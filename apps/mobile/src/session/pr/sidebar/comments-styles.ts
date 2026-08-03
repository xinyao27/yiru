import { cn } from 'cnfast'

// Styles for the PR comments timeline (body + comment cards + reactions).
// Split out of mobile-pr-sidebar-styles to keep that file under the
// 300-line cap. Muted/monochrome to match the rest of the PR sidebar.
export const prCommentsStyles = {
  noDescription: cn('text-muted-foreground text-xs italic'),

  group: cn('gap-2'),

  avatar: cn('h-5 w-5 rounded-full bg-secondary'),

  empty: cn(
    'border-hairline border-border text-muted-foreground rounded-xl border-dashed px-3 py-6 text-xs'
  )
} as const
