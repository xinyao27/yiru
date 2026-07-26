import { cn } from '@/style/class-names'

// Styles for PRActionsSection (action buttons, auto-merge toggle, transient-error
// line). Split out of mobile-pr-sidebar-styles to keep that file under the
// 300-line cap.
export const prActionsStyles = {
  secondaryButton: cn('flex-1'),
  // Primary CTA (merge) and secondary action buttons (close/reopen/rerun/add).
  actionButton: cn(
    'min-h-11 flex-row items-center justify-center gap-2 py-2 px-3 bg-secondary border-hairline border-border'
  ),

  actionButtonDisabled: cn('opacity-[0.5]'),
  // Why: shrink + single-line (numberOfLines=1 at call sites) so a long label
  // like "Link existing pull request" can't wrap and inflate the button's
  // effective padding on a narrow sidebar.
  actionButtonText: cn('shrink text-foreground text-sm font-bold')
} as const
