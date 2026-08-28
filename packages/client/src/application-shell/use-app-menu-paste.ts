import { useEffect } from 'react'
import { toast } from 'sonner'
import { handleAppMenuPasteRequest } from '~renderer/application-shell/menu-paste'
import { translate } from '~renderer/i18n/i18n'
import { shellClient } from '~renderer/runtime/shell-client'

export function useAppMenuPaste(): void {
  useEffect(() => {
    const handlePaste = (options?: { mode?: 'paste' | 'paste-and-match-style' }): void => {
      void handleAppMenuPasteRequest({
        readClipboardText: shellClient.ui.readClipboardText,
        performNativePaste: shellClient.ui.performNativePaste,
        nativePasteMode: options?.mode ?? 'paste'
      })
        .then((result) => {
          if (result.status === 'rejected' && result.reason === 'too-large') {
            toast.error(
              translate('auto.hooks.useAppMenuPaste.pasteTooLarge', 'Paste is too large.')
            )
          }
        })
        .catch(() => {
          // Why: only the request handler knows whether native fallback is
          // still targeting the originally owned control after async work.
          return undefined
        })
    }

    const unsubscribeAppMenuPaste = shellClient.ui.onAppMenuPaste(() => handlePaste())
    const unsubscribeEditableContextPaste = shellClient.ui.onEditableContextPaste((data) => {
      handlePaste({ mode: data.plainTextOnly ? 'paste-and-match-style' : 'paste' })
    })
    return () => {
      unsubscribeAppMenuPaste()
      unsubscribeEditableContextPaste()
    }
  }, [])
}
