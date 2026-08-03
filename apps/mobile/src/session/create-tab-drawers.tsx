import { Platform } from 'react-native'

import { ActionSheetModal, type ActionSheetAction } from '~/components/action-sheet-modal'
import { TextInputModal } from '~/components/text-input-modal'
import { FileText, Globe, TerminalWindow as SquareTerminal } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

type CreateTabDrawersProps = {
  actionVisible: boolean
  browserInputVisible: boolean
  agentActions: ActionSheetAction[]
  browserSupported: boolean
  isFloatingWorkspace: boolean
  onActionClose: () => void
  onBrowserInputClose: () => void
  onBrowserSubmit: (value: string) => void
  onBrowserUnavailable: () => void
  onCreateMarkdown: () => void
  onCreateTerminal: () => void
  onOpenBrowserInput: () => void
}

export function CreateTabDrawers({
  actionVisible,
  browserInputVisible,
  agentActions,
  browserSupported,
  isFloatingWorkspace,
  onActionClose,
  onBrowserInputClose,
  onBrowserSubmit,
  onBrowserUnavailable,
  onCreateMarkdown,
  onCreateTerminal,
  onOpenBrowserInput
}: CreateTabDrawersProps): React.JSX.Element {
  return (
    <>
      <ActionSheetModal
        visible={actionVisible}
        title={translate('mobile.session.newTab.title', 'New Tab')}
        actions={[
          ...agentActions,
          {
            label: translate('mobile.session.newTab.terminal', 'Terminal'),
            icon: SquareTerminal,
            onPress: () => {
              onActionClose()
              onCreateTerminal()
            }
          },
          ...(isFloatingWorkspace
            ? []
            : [
                {
                  label: translate('mobile.session.newTab.browser', 'Browser'),
                  icon: Globe,
                  onPress: () => {
                    onActionClose()
                    if (browserSupported) {
                      onOpenBrowserInput()
                    } else {
                      onBrowserUnavailable()
                    }
                  }
                },
                {
                  label: translate('mobile.session.newTab.markdownNote', 'Markdown Note'),
                  icon: FileText,
                  onPress: () => {
                    onActionClose()
                    onCreateMarkdown()
                  }
                }
              ])
        ]}
        onClose={onActionClose}
      />

      <TextInputModal
        visible={browserInputVisible}
        title={translate('mobile.session.newBrowser.title', 'New Browser')}
        message={translate(
          'mobile.session.newBrowser.message',
          'Enter a URL, or leave blank for a new tab.'
        )}
        defaultValue=""
        placeholder={translate('mobile.session.newBrowser.placeholder', 'https://example.com')}
        submitLabel={translate('mobile.session.newBrowser.open', 'Open')}
        allowEmpty
        selectTextOnFocus
        keyboardType={Platform.OS === 'ios' ? 'url' : 'default'}
        onSubmit={onBrowserSubmit}
        onCancel={onBrowserInputClose}
      />
    </>
  )
}
