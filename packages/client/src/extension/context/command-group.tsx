import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { ClockCounterClockwise, Globe } from '~renderer/icons/hugeicons'
import { CommandGroup, CommandItem } from '~renderer/ui/command'

import { getExtensionBrowserCapabilities } from '../browser-capabilities'

type BrowserContextCommandGroupProps = {
  onOpenCapture: () => void
  run: (action: () => void) => void
}

export function BrowserContextCommandGroup({
  onOpenCapture,
  run
}: BrowserContextCommandGroupProps): React.JSX.Element {
  const capabilities = getExtensionBrowserCapabilities()
  const queryClient = useQueryClient()

  const reviewRecentHistory = async (): Promise<void> => {
    try {
      const context = await capabilities.readRecentHistoryContext(30)
      queryClient.setQueryData(['extension-host', 'pending-page-context'], context)
      toast.success(
        translate('extension.context.historyReady', 'Recent browsing is ready to review.')
      )
    } catch {
      toast.error(
        translate(
          'extension.context.historyFailed',
          'Recent browsing was not read. Check Chrome history permission and try again.'
        )
      )
    }
  }

  return (
    <CommandGroup heading={translate('extension.commandPalette.browserContext', 'Browser context')}>
      <CommandItem value="use attach current page context" onSelect={() => run(onOpenCapture)}>
        <Globe />
        {translate('extension.context.useCurrentPage', 'Use current page')}
      </CommandItem>
      <CommandItem
        value="review attach recent browsing history 30 minutes"
        onSelect={() => run(() => void reviewRecentHistory())}
      >
        <ClockCounterClockwise />
        {translate('extension.context.recentHistory', 'Review last 30 min')}
      </CommandItem>
    </CommandGroup>
  )
}
