import { toast } from 'sonner'
import { translate } from '~renderer/i18n/i18n'
import { shellClient } from '~renderer/runtime/shell-client'

export async function copyRichMarkdownLink(href: string): Promise<void> {
  try {
    await shellClient.ui.writeClipboardText(href)
    toast.success(
      translate('auto.components.editor.richMarkdownLinkClipboard.copiedLink', 'Copied link')
    )
  } catch {
    toast.error(
      translate(
        'auto.components.editor.richMarkdownLinkClipboard.copyLinkFailed',
        'Failed to copy link'
      )
    )
  }
}
