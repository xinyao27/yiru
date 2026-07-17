import { X } from '@phosphor-icons/react'
import { ShortcutKeyCombo } from '@/components/ShortcutKeyCombo'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useShortcutKeyDetails } from '@/hooks/useShortcutLabel'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { TAB_CLOSE_BUTTON_CLASSES } from './tab-close-button-classes'

export function TabCloseButton({
  ariaLabel,
  className,
  onClose
}: {
  ariaLabel: string
  className?: string
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
            // Why: one stable affordance lets E2E exercise the same hover-close
            // path users take across terminal, browser, editor, and simulator tabs.
            data-tab-close-button="true"
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
            <X className="size-4" />
          </Button>
        }
      />
      <TooltipContent side="bottom" sideOffset={6} className="flex items-center gap-2">
        <span>
          {translate('auto.components.tab.bar.EditorFileTabCloseButton.a768f428f1', 'Close tab')}
        </span>
        {closeShortcut.keys.length > 0 && (
          <ShortcutKeyCombo keys={closeShortcut.keys} doubleTap={closeShortcut.doubleTap} />
        )}
      </TooltipContent>
    </Tooltip>
  )
}
