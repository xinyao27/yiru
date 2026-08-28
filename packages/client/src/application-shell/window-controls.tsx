import { useEffect, useState } from 'react'

import { translate } from '../i18n/i18n'
import { WindowClose, WindowMaximize, WindowMinimize } from '../icons/hugeicons'
import { shellClient } from '../runtime/shell-client'
import { Button } from '../ui/button'
import { cn } from '../ui/class-names'

const WINDOW_CONTROL_BUTTON_CLASS_NAME =
  'h-[var(--titlebar-height)] w-[46px] bg-background text-muted-foreground transition-[background,color] duration-100 hover:bg-accent hover:text-foreground'

export function WindowControls(): React.JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)
  useEffect(() => {
    let cancelled = false
    void shellClient.ui.isMaximized().then((value) => {
      if (!cancelled) {
        setIsMaximized(value)
      }
    })
    const unsubscribe = shellClient.ui.onMaximizeChanged(setIsMaximized)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return (
    <div
      data-testid="window-controls"
      className="fixed top-0 right-0 z-[9999] flex h-[var(--titlebar-height)] flex-row [-webkit-app-region:no-drag]"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={WINDOW_CONTROL_BUTTON_CLASS_NAME}
        aria-label={translate('auto.App.bbb7f90669', 'Minimize')}
        onClick={() => shellClient.ui.minimize()}
      >
        <WindowMinimize className="size-2.5" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={WINDOW_CONTROL_BUTTON_CLASS_NAME}
        aria-label={
          isMaximized
            ? translate('auto.App.66f0a552e5', 'Restore')
            : translate('auto.App.c9d6f98459', 'Maximize')
        }
        onClick={() => shellClient.ui.maximize()}
      >
        <WindowMaximize className="size-2.5" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn(
          WINDOW_CONTROL_BUTTON_CLASS_NAME,
          'hover:bg-destructive hover:text-white dark:hover:bg-destructive dark:hover:text-white'
        )}
        aria-label={translate('auto.App.e960d18540', 'Close')}
        // Why: route through the host so its terminal-running close guard remains authoritative.
        onClick={() => shellClient.ui.requestClose()}
      >
        <WindowClose className="size-2.5" aria-hidden />
      </Button>
    </div>
  )
}
