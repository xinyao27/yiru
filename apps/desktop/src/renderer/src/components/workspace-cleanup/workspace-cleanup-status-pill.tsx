import React from 'react'

import { cn } from '@/lib/class-names'

import type { StatusPillTone } from './workspace-cleanup-candidate-row-data'

export function StatusPill({
  children,
  tone = 'neutral'
}: {
  children: React.ReactNode
  tone?: StatusPillTone
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium',
        tone === 'neutral' && 'border-border bg-background text-muted-foreground',
        tone === 'ready' &&
          'border-green-700/25 bg-green-700/10 text-green-700 dark:border-green-300/25 dark:bg-green-300/10 dark:text-green-300',
        tone === 'review' && 'border-border bg-muted text-foreground',
        tone === 'destructive' && 'border-destructive/30 text-destructive'
      )}
    >
      {children}
    </span>
  )
}
