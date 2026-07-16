import type React from 'react'
import {
  AlertTriangle,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  LoaderCircle
} from 'lucide-react'

export const CHECK_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  success: CircleCheck,
  failure: CircleX,
  pending: LoaderCircle,
  neutral: CircleDashed,
  skipped: CircleMinus,
  cancelled: CircleX,
  timed_out: CircleX,
  action_required: AlertTriangle
}

export const CHECK_COLOR: Record<string, string> = {
  success: 'text-status-success',
  failure: 'text-destructive',
  pending: 'text-amber-500',
  neutral: 'text-muted-foreground',
  skipped: 'text-muted-foreground/60',
  cancelled: 'text-muted-foreground/60',
  timed_out: 'text-destructive',
  action_required: 'text-amber-500'
}
