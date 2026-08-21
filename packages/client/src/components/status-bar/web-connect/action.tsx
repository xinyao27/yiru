import { useState } from 'react'
import { Button } from '~renderer/components/ui/button'
import { translate } from '~renderer/i18n/i18n'
import { shellClient } from '~renderer/runtime/shell-client'

import { useWebConnectStatus } from './state'

export function WebConnectAction(): React.JSX.Element | null {
  const status = useWebConnectStatus()
  const [busy, setBusy] = useState(false)

  if (!status) {
    return null
  }

  if (status.pendingVerification) {
    const pending = status.pendingVerification
    return (
      <div className="border-border mt-2 flex flex-col gap-2 border-t pt-2">
        <p className="text-xs font-medium">
          {translate('auto.statusBar.webConnect.verifyTitle', 'Confirm this browser')}
        </p>
        <p className="text-muted-foreground text-xs leading-5">
          {translate(
            'auto.statusBar.webConnect.verifyDescription',
            'The web page must show this same code before you approve it.'
          )}
        </p>
        <div className="font-mono text-xl tracking-[0.28em] tabular-nums">
          {pending.verificationCode}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void shellClient.webConnect.confirmPendingVerification().finally(() => setBusy(false))
            }}
          >
            {translate('auto.statusBar.webConnect.confirm', 'Codes match')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => void shellClient.webConnect.cancelPendingVerification()}
          >
            {translate('auto.statusBar.webConnect.cancel', 'Cancel')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="border-border mt-2 flex flex-col gap-2 border-t pt-2">
      <Button
        type="button"
        size="sm"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          void shellClient.webConnect.openBrowserSession().finally(() => setBusy(false))
        }}
      >
        {status.state === 'online'
          ? translate('auto.statusBar.webConnect.openConnected', 'Open in browser')
          : translate('auto.statusBar.webConnect.connectBrowser', 'Connect a browser')}
      </Button>
      <p className="text-muted-foreground text-xs leading-5">
        {status.state === 'online'
          ? translate(
              'auto.statusBar.webConnect.onlineDescription',
              'This computer is reachable from the Web app while Yiru stays open.'
            )
          : translate(
              'auto.statusBar.webConnect.offlineDescription',
              'Opens the Web app and pairs it with this computer — no command needed.'
            )}
      </p>
    </div>
  )
}
