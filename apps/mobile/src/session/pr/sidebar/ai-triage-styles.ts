import { cn } from '~/style/class-names'

// Styles for the "Fix checks with AI" / "Resolve conflicts with AI" triage
// affordances. Kept in their own focused file (rather than growing the shared
// sidebar/conflict style sheets) and muted/monochrome to match the sidebar.
export const prAiTriageStyles = {
  triageError: cn('text-destructive text-xs')
} as const
