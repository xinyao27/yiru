import { cn } from '@/style/class-names'

// Styles for PRActionsSection (action buttons, auto-merge toggle, transient-error
// line). Split out of mobile-pr-sidebar-styles to keep that file under the
// 300-line cap.
export const prActionsStyles = {
  // Bare block when identity + actions share one section card.
  actionsBlock: cn('gap-2'),
  // Close/Reopen + Unlink share a row so secondary actions don't stack full-width.
  secondaryRow: cn('flex-row items-stretch gap-2'),
  secondaryButton: cn('flex-1'),
  // Primary CTA (merge) and secondary action buttons (close/reopen/rerun/add).
  actionButton: cn(
    'min-h-11 flex-row items-center justify-center gap-2 py-2 px-3 rounded-none bg-secondary border-hairline border-border'
  ),
  // Neutral primary: a light fill with dark text, mirroring the desktop PR page's
  // default button (no bright accent) so the sidebar stays mostly monochrome.
  actionButtonPrimary: cn('bg-foreground border-foreground'),
  // Merge CTA: green fill + white text, matching the desktop ChecksPanel's
  // affirmative merge action. The merge still confirms before firing.
  actionButtonMerge: cn('bg-green-600 border-green-600'),
  actionButtonTextMerge: cn('text-white'),
  actionButtonDisabled: cn('opacity-[0.5]'),
  // Why: shrink + single-line (numberOfLines=1 at call sites) so a long label
  // like "Link existing pull request" can't wrap and inflate the button's
  // effective padding on a narrow sidebar.
  actionButtonText: cn('shrink text-foreground text-[14px] font-bold'),
  actionButtonTextPrimary: cn('text-background'),
  actionButtonDestructiveText: cn('text-destructive'),
  // Auto-merge toggle row: label + a pill that reflects on/off state.
  toggleRow: cn('min-h-11 flex-row items-center justify-between gap-2'),
  toggleLabel: cn('text-foreground text-[14px] shrink'),
  togglePill: cn(
    'min-w-14 min-h-[30px] items-center justify-center px-2 rounded-none border-hairline border-border bg-card'
  ),
  togglePillOn: cn('border-muted-foreground bg-secondary'),
  togglePillText: cn('text-[12px] font-bold text-muted-foreground'),
  togglePillTextOn: cn('text-foreground'),
  // Non-blocking error line shown under an action after a transient failure.
  actionError: cn('text-destructive text-[12px] leading-[18px]')
} as const
