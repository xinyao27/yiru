import type React from 'react'
import { CaretDown as ChevronDown } from '~renderer/components/icons/hugeicons'
import { Button } from '~renderer/components/ui/button'
import { translate } from '~renderer/i18n/i18n'
import { cn } from '~renderer/lib/class-names'

type SourceControlSectionHeaderContentProps = {
  label: string
  count: number
  conflictCount?: number
}

function SourceControlSectionHeaderContent({
  label,
  count,
  conflictCount = 0
}: SourceControlSectionHeaderContentProps): React.JSX.Element {
  return (
    <>
      <span className="ml-0.5">{label}</span>
      <span className="text-[11px] font-medium tabular-nums">{count}</span>
      {conflictCount > 0 ? (
        <span className="text-destructive/80 text-[11px] font-medium">
          · {conflictCount}{' '}
          {translate('auto.components.right.sidebar.SourceControl.413a3ba113', 'conflict')}
          {conflictCount === 1 ? '' : 's'}
        </span>
      ) : null}
    </>
  )
}

export function SourceControlSectionHeader({
  label,
  count,
  conflictCount = 0,
  isCollapsed,
  onToggle,
  actions
}: SourceControlSectionHeaderContentProps & {
  isCollapsed: boolean
  onToggle: () => void
  actions?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="pt-3 pb-1">
      <div className="group/section hover:bg-accent hover:text-accent-foreground flex items-center pr-2 pl-0.5">
        <Button
          variant="ghost"
          size="xs"
          type="button"
          className="text-foreground/70 group-hover/section:text-accent-foreground focus-visible:bg-accent flex h-auto flex-1 justify-start border-0 px-0.5 py-0.5 text-left font-semibold tracking-wider whitespace-normal uppercase"
          onClick={onToggle}
        >
          <ChevronDown
            className={cn(
              'text-muted-foreground group-hover/section:text-accent-foreground size-4 shrink-0 transition-transform',
              isCollapsed && '-rotate-90'
            )}
          />
          <SourceControlSectionHeaderContent
            label={label}
            count={count}
            conflictCount={conflictCount}
          />
        </Button>
        <div className="flex shrink-0 items-center">{actions}</div>
      </div>
    </div>
  )
}
