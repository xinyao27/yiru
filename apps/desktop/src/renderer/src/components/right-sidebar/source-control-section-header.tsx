import type React from 'react'

import { CaretDown as ChevronDown } from '@/components/regular-icons'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

export function SourceControlSectionHeader({
  label,
  count,
  conflictCount = 0,
  isCollapsed,
  onToggle,
  actions
}: {
  label: string
  count: number
  conflictCount?: number
  isCollapsed: boolean
  onToggle: () => void
  actions?: React.ReactNode
}): React.JSX.Element {
  // Why: local and projected Source Control sections must keep one hover and disclosure surface.
  return (
    <div className="pt-3 pr-3 pb-1 pl-1">
      <div className="group/section hover:bg-accent hover:text-accent-foreground flex items-center rounded-md pr-1">
        <button
          type="button"
          className="text-foreground/70 group-hover/section:text-accent-foreground focus-visible:bg-accent flex flex-1 items-center gap-1 px-0.5 py-0.5 text-left text-xs font-semibold tracking-wider uppercase outline-none"
          onClick={onToggle}
        >
          <ChevronDown
            className={cn('size-3.5 shrink-0 transition-transform', isCollapsed && '-rotate-90')}
          />
          <span>{label}</span>
          <span className="text-[11px] font-medium tabular-nums">{count}</span>
          {conflictCount > 0 ? (
            <span className="text-destructive/80 text-[11px] font-medium">
              · {conflictCount}{' '}
              {translate('auto.components.right.sidebar.SourceControl.413a3ba113', 'conflict')}
              {conflictCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </button>
        <div className="flex shrink-0 items-center">{actions}</div>
      </div>
    </div>
  )
}
