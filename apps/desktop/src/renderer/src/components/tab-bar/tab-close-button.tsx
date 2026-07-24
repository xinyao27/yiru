import { X } from '@phosphor-icons/react'

import { ShortcutKeyCombo } from '@/components/shortcut-key-combo'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useShortcutKeyDetails } from '@/hooks/use-shortcut-label'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/class-names'

import { TAB_CLOSE_BUTTON_CLASSES } from './tab-close-button-classes'

export function TabCloseButton({
  ariaLabel,
  className,
  iconClassName,
  onClose
}: {
  ariaLabel: string
  className?: string
  iconClassName?: string
  onClose: () => void
}): React.JSX.Element {
  const closeShortcut = useShortcutKeyDetails('tab.close')

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            className={cn(TAB_CLOSE_BUTTON_CLASSES, className)}
            variant="ghost"
            size="icon-xs"
            type="button"
            aria-label={ariaLabel}
            onPointerDown={(event) => {
              if (event.button === 0) {
                event.stopPropagation()
              }
            }}
            onMouseDown={(event) => {
              if (event.button === 0) {
                event.stopPropagation()
              }
            }}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onClose()
            }}
          >
            <X weight="regular" className={cn('size-4', iconClassName)} />
          </Button>
        }
      />
      <TooltipContent side="bottom" sideOffset={6} className="flex items-center gap-2">
        <span>
          {translate('auto.components.tab.bar.EditorFileTabCloseButton.a768f428f1', 'Close tab')}
        </span>
        {closeShortcut.keys.length > 0 && (
          <ShortcutKeyCombo
            keys={closeShortcut.keys}
            variant="inverted"
            doubleTap={closeShortcut.doubleTap}
          />
        )}
      </TooltipContent>
    </Tooltip>
  )
}
