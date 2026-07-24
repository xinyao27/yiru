import { CaretRight as ChevronRight } from '@phosphor-icons/react'
import type React from 'react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import { useAppStore } from '../../store'
import { normalizeSettingsSearchQuery } from './settings-search'

type AppearanceAdvancedDisclosureProps = {
  /** Optional override label; defaults to "Advanced". */
  label?: string
  showTopBorder?: boolean
  className?: string
  contentClassName?: string
  children: React.ReactNode
}

/** Inline "Advanced" disclosure for low-frequency controls. An active settings
 *  search force-opens it so matching controls stay reachable instead of being
 *  hidden behind a collapsed trigger. */
export function AppearanceAdvancedDisclosure({
  label,
  showTopBorder = true,
  className,
  contentClassName,
  children
}: AppearanceAdvancedDisclosureProps): React.JSX.Element {
  const searchQuery = useAppStore((state) => state.settingsSearchQuery)
  const isSearching = normalizeSettingsSearchQuery(searchQuery).length > 0
  const [open, setOpen] = useState(false)
  const expanded = open || isSearching

  return (
    <div className={cn('mt-3 pt-2', showTopBorder && 'border-t border-border/50', className)}>
      <Button
        variant="ghost"
        size="xs"
        type="button"
        aria-expanded={expanded}
        onClick={() => setOpen((prev) => !prev)}
        // Why: while searching the disclosure is forced open, so disable the
        // toggle's collapse affordance rather than letting it fight the search.
        disabled={isSearching}
        className="text-foreground flex h-auto w-full justify-start gap-2 border-0 py-1 text-sm font-semibold whitespace-normal focus-visible:outline-none disabled:cursor-default"
      >
        <ChevronRight
          weight="regular"
          className={cn(
            'size-3.5 text-muted-foreground transition-transform',
            expanded && 'rotate-90'
          )}
        />
        {label ??
          translate('auto.components.settings.AppearanceAdvancedDisclosure.advanced', 'Advanced')}
      </Button>
      {expanded ? <div className={cn('pt-1', contentClassName)}>{children}</div> : null}
    </div>
  )
}
