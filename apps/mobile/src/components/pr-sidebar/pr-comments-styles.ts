import { cn } from '@/style/class-names'

// Styles for the PR comments timeline (body + audience tabs + comment cards +
// reactions). Split out of mobile-pr-sidebar-styles to keep that file under the
// 300-line cap. Muted/monochrome to match the rest of the PR sidebar.
export const prCommentsStyles = {
  noDescription: cn('text-muted-foreground text-xs italic'),

  audienceTabText: cn('text-muted-foreground text-xs font-semibold'),
  audienceTabTextActive: cn('text-foreground'),

  group: cn('gap-2'),

  avatar: cn('w-5 h-5 bg-secondary'),

  empty: cn('border-hairline border-dashed border-border px-3 py-6 text-muted-foreground text-xs'),
  actionButton: cn(
    'flex-row items-center gap-1 min-h-7 px-2 border-hairline border-border bg-secondary'
  ),
  actionButtonPressedActive: cn('active:bg-accent'),
  actionButtonText: cn('text-muted-foreground text-xs font-semibold')
} as const
