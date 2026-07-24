import {
  CheckCircle as CircleCheck,
  XCircle as CircleX,
  CaretDown as ChevronDown
} from '@phosphor-icons/react'
import React from 'react'

import { LoadingIndicator } from '@/components/loading-indicator'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

type ChecksSummaryProps = {
  checksCount: number
  passingCount: number
  failingCount: number
  pendingCount: number
  checksLoading: boolean
  checksExpanded: boolean
  onToggle: () => void
}

export function ChecksSummary({
  checksCount,
  passingCount,
  failingCount,
  pendingCount,
  checksLoading,
  checksExpanded,
  onToggle
}: ChecksSummaryProps): React.JSX.Element | null {
  if (checksCount === 0) {
    return null
  }
  return (
    <Button
      variant="quiet"
      size="default"
      type="button"
      className="/40 /40 flex w-full justify-start gap-3 border-b px-3 text-left text-[10px] font-normal whitespace-normal"
      onClick={onToggle}
      aria-expanded={checksExpanded}
    >
      <ChevronDown
        weight="regular"
        className={cn('size-3 shrink-0 transition-transform', !checksExpanded && '-rotate-90')}
      />
      {passingCount > 0 && (
        <span className="flex items-center gap-1">
          <CircleCheck className="size-3 text-emerald-500" />
          {passingCount}{' '}
          {translate('auto.components.right.sidebar.checks.panel.content.02ca4f9074', 'passing')}
        </span>
      )}
      {failingCount > 0 && (
        <span className="flex items-center gap-1">
          <CircleX className="size-3 text-rose-500" />
          {failingCount}{' '}
          {translate('auto.components.right.sidebar.checks.panel.content.5e52f4ef7f', 'failing')}
        </span>
      )}
      {pendingCount > 0 && (
        <span className="flex items-center gap-1">
          <LoadingIndicator className="size-3 text-amber-500" />
          {pendingCount}{' '}
          {translate('auto.components.right.sidebar.checks.panel.content.9ad98f2a17', 'pending')}
        </span>
      )}
      <span className="flex-1" />
      {checksLoading && <LoadingIndicator className="text-muted-foreground size-3" />}
    </Button>
  )
}
