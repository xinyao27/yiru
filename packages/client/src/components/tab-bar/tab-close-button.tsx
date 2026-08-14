import { X } from '@phosphor-icons/react'
import { ShortcutKeyCombo } from '~renderer/components/shortcut-key-combo'
import { Button } from '~renderer/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/components/ui/tooltip'
import { useShortcutKeyDetails } from '~renderer/hooks/use-shortcut-label'
import { translate } from '~renderer/i18n/i18n'

import { TAB_CLOSE_BUTTON_CLASSES } from './tab-close-button-classes'

export function TabCloseButton({
  ariaLabel,
  onClose
}: {
  ariaLabel: string
  onClose: () => void
}): React.JSX.Element {
  const closeShortcut = useShortcutKeyDetails('tab.close')

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            className={TAB_CLOSE_BUTTON_CLASSES}
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
            <X className="size-3.5" />
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
