import React from 'react'

import { Badge } from '@/components/ui/badge'

import type { StatusPillTone } from './workspace-cleanup-candidate-row-data'

export function StatusPill({
  children,
  tone = 'neutral'
}: {
  children: React.ReactNode
  tone?: StatusPillTone
}): React.JSX.Element {
  const variant =
    tone === 'ready'
      ? 'success'
      : tone === 'destructive'
        ? 'destructive'
        : tone === 'review'
          ? 'secondary'
          : 'outline'

  return (
    <Badge variant={variant} size="xs">
      {children}
    </Badge>
  )
}
