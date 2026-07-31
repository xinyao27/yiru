import { Check, CaretDown as ChevronDown } from '@phosphor-icons/react'

import { cn } from '../../../lib/class-names'
import { Button } from '../../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../../ui/dropdown-menu'
import { DiffLineCounts } from './entry-details'
import type { SourceControlScopeId, SourceControlScopeOption } from './scope-model'

function ScopeSummary({
  option,
  className
}: {
  option: SourceControlScopeOption
  className?: string
}): React.JSX.Element {
  return (
    <span className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <span className="min-w-0 truncate">{option.label}</span>
      <span className="text-muted-foreground text-[11px] leading-none tabular-nums">
        {option.count}
      </span>
      {option.conflictCount > 0 ? (
        <span className="text-destructive/80 text-[11px] leading-none tabular-nums">
          {option.conflictCount}
        </span>
      ) : null}
      <DiffLineCounts added={option.added} removed={option.removed} />
    </span>
  )
}

export function SourceControlScopeSelect({
  activeScope,
  options,
  onSelectScope
}: {
  activeScope: SourceControlScopeOption | null
  options: readonly SourceControlScopeOption[]
  onSelectScope: (scopeId: SourceControlScopeId) => void
}): React.JSX.Element | null {
  if (!activeScope) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="quiet"
            size="xs"
            // Why: negative margin pulls the label flush with the panel's
            // content edge while the button keeps a comfortable hover target.
            className="-ml-1 h-7 min-w-0 shrink justify-start px-1 font-medium"
            aria-label={activeScope.label}
            title={activeScope.label}
          >
            <ScopeSummary option={activeScope} />
            <ChevronDown className="text-muted-foreground shrink-0" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-[220px]">
        {options.map((option) => (
          <DropdownMenuItem key={option.id} onClick={() => onSelectScope(option.id)}>
            <ScopeSummary option={option} className="flex-1" />
            {option.id === activeScope.id ? <Check className="size-3.5 shrink-0" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
