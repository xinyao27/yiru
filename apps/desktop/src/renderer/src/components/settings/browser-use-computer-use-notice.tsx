import { CursorClick as MousePointerClick } from '@phosphor-icons/react'

import { translate } from '@/i18n/i18n'

import { Button } from '../ui/button'

export function BrowserUseComputerUseNotice({
  onOpenComputerUse
}: {
  onOpenComputerUse: () => void
}): React.JSX.Element {
  return (
    <div className="border-border/60 bg-card/50 border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">
            {translate(
              'auto.components.settings.BrowserUseComputerUseNotice.333984cf90',
              'Use an existing browser session'
            )}
          </p>
          <p className="text-muted-foreground text-xs">
            {translate(
              'auto.components.settings.BrowserUseComputerUseNotice.79209b37b9',
              'If cookie import is not the right fit, Computer Use can control local apps and may use existing logged-in browser sessions where applicable. Install the Computer Use skill; macOS also requires privacy permissions.'
            )}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenComputerUse}
          className="shrink-0 gap-1.5 self-start"
        >
          <MousePointerClick className="size-3.5" />
          {translate(
            'auto.components.settings.BrowserUseComputerUseNotice.15b5e680ba',
            'Open Computer Use'
          )}
        </Button>
      </div>
    </div>
  )
}
