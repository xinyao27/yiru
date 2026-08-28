import { translate } from '~renderer/i18n/i18n'
import { X } from '~renderer/icons/hugeicons'
import { useShortcutKeyDetails } from '~renderer/keyboard-input/use-shortcut-label'
import { Button } from '~renderer/ui/button'
import { ShortcutKeyCombo } from '~renderer/ui/shortcut-key-combo'
import { Tooltip, TooltipContent, TooltipTrigger } from '~renderer/ui/tooltip'

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
