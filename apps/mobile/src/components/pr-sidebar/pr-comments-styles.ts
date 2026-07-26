import { cn } from '@/style/class-names'

// Styles for the PR comments timeline (body + audience tabs + comment cards +
// reactions). Split out of mobile-pr-sidebar-styles to keep that file under the
// 300-line cap. Muted/monochrome to match the rest of the PR sidebar.
export const prCommentsStyles = {
  noDescription: cn('text-muted-foreground text-xs italic'),

  audienceTabText: cn('text-muted-foreground text-xs font-semibold'),
  audienceTabTextActive: cn('text-foreground'),

  group: cn('gap-2'),

  avatar: cn('h-5 w-5 rounded-full bg-secondary'),

  empty: cn(
    'border-hairline border-border text-muted-foreground rounded-xl border-dashed px-3 py-6 text-xs'
  ),
  actionButton: cn(
    'border-hairline border-border min-h-7 flex-row items-center gap-1 rounded-lg bg-secondary px-2'
  ),
  actionButtonPressedActive: cn('active:bg-accent'),
  actionButtonText: cn('text-muted-foreground text-xs font-semibold')
} as const
