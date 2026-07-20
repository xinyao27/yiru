import { TerminalWindow as TerminalSquare } from '@phosphor-icons/react'
import type React from 'react'

import { Plus } from '@/components/regular-icons'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

type WorkspaceTabCreateMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  disabled?: boolean
  disabledTooltip?: string | null
  finalFocus?: React.ComponentProps<typeof DropdownMenuContent>['finalFocus']
}

export function WorkspaceTabCreateMenu({
  open,
  onOpenChange,
  children,
  disabled = false,
  disabledTooltip = null,
  finalFocus
}: WorkspaceTabCreateMenuProps): React.JSX.Element {
  const label = translate('auto.components.tab.bar.TabBar.b1a132357f', 'New tab')
  const triggerButton = (
    <Button
      type="button"
      variant="outline"
      size="icon-xs"
      className={cn(
        'ml-1 my-auto h-7 w-6 shrink-0 text-muted-foreground hover:text-accent-foreground',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-background hover:text-muted-foreground'
      )}
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      // Why: the shared accessible name keeps both local and remote create
      // affordances discoverable without coupling tests to their glyph.
      aria-label={label}
      aria-disabled={disabled}
      onPointerDown={(event) => {
        if (disabled) {
          event.preventDefault()
        }
      }}
      onKeyDown={(event) => {
        if (disabled && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown')) {
          event.preventDefault()
        }
      }}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault()
        }
      }}
    >
      <Plus className="size-4" />
    </Button>
  )
  const trigger = <TooltipTrigger render={<DropdownMenuTrigger render={triggerButton} />} />

  return (
    <DropdownMenu
      open={disabled ? false : open}
      onOpenChange={(nextOpen) => {
        if (!disabled) {
          onOpenChange(nextOpen)
        }
      }}
      // Why: actions launched from this menu can leave interactive UI outside
      // the renderer surface; modal pointer suppression would strand that UI.
      modal={false}
    >
      <Tooltip>
        {trigger}
        <TooltipContent side="bottom" sideOffset={6}>
          {disabledTooltip ?? label}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="border-border/80 w-72 max-w-[calc(100vw-1rem)] rounded-lg p-1 shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
        finalFocus={finalFocus}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function WorkspaceNewTerminalMenuItem({
  onSelect,
  shortcut,
  disabled = false
}: {
  onSelect: () => void
  shortcut?: React.ReactNode
  disabled?: boolean
}): React.JSX.Element {
  return (
    <DropdownMenuItem
      disabled={disabled}
      onClick={onSelect}
      className="gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium"
    >
      <TerminalSquare className="text-muted-foreground size-4" />
      <span className="flex-1">
        {translate('auto.components.tab.bar.TabBar.d364f3c8d4', 'New Terminal')}
      </span>
      {shortcut ? <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut> : null}
    </DropdownMenuItem>
  )
}
