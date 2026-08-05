import { MenuView, type MenuAction } from '@expo/ui/community/menu'
import { View } from 'react-native'

import { MobileGlassSurface } from '~/components/glass/surface'
import { Plus } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import type { MobileImageSource } from '../image-source-picker'

export type MobileTerminalToolsMenuProps = {
  canPaste: boolean
  canSend: boolean
  isAttaching: boolean
  onAttachImage: ((source: MobileImageSource) => void) | null
  onPaste: () => void
}

type TerminalToolsActionId = 'attachment' | 'camera' | 'files' | 'library' | 'paste'

function getAttachmentSource(actionId: string): MobileImageSource | null {
  if (actionId === 'camera' || actionId === 'library' || actionId === 'files') {
    return actionId
  }
  return null
}

function isTerminalToolsActionId(value: string): value is TerminalToolsActionId {
  return (
    value === 'attachment' ||
    value === 'camera' ||
    value === 'chat' ||
    value === 'files' ||
    value === 'library' ||
    value === 'paste'
  )
}

function buildMenuActions({
  canPaste,
  canSend,
  isAttaching,
  onAttachImage
}: MobileTerminalToolsMenuProps): MenuAction[] {
  const actions: MenuAction[] = [
    {
      id: 'paste',
      image: 'doc.on.clipboard',
      title: translate('mobile.terminal.pasteFromClipboard', 'Paste from clipboard'),
      attributes: { disabled: !canSend || !canPaste }
    }
  ]

  if (onAttachImage) {
    actions.push({
      id: 'attachment',
      image: 'paperclip',
      title: translate('mobile.session.attachments.add', 'Add attachment'),
      attributes: { disabled: !canSend || isAttaching },
      subactions: [
        {
          id: 'camera',
          image: 'camera',
          title: translate('mobile.session.attachments.camera', 'Camera')
        },
        {
          id: 'library',
          image: 'photo.on.rectangle',
          title: translate('mobile.session.attachments.photos', 'Photos')
        },
        {
          id: 'files',
          image: 'folder',
          title: translate('mobile.session.attachments.files', 'Files')
        }
      ]
    })
  }

  return actions
}

function TerminalToolsTrigger(): React.JSX.Element {
  return (
    <View className="h-11 w-11 items-center justify-center">
      <MobileGlassSurface
        className="bg-card h-9 w-9 overflow-hidden rounded-full"
        fallbackClassName="border-transparent bg-secondary"
        isFunctional
        isInteractive
      >
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={translate(
            'mobile.terminal.openAccessoryTools',
            'Open terminal tools'
          )}
          className="h-full w-full items-center justify-center"
        >
          <Plus size={18} colorClassName="accent-muted-foreground" />
        </View>
      </MobileGlassSurface>
    </View>
  )
}

export function MobileTerminalToolsMenu(props: MobileTerminalToolsMenuProps): React.JSX.Element {
  const actions = buildMenuActions(props)

  return (
    <MenuView
      actions={actions}
      title={translate('mobile.terminal.accessoryToolsTitle', 'Terminal tools')}
      onPressAction={(event) => {
        const actionId = event.nativeEvent.event
        if (!isTerminalToolsActionId(actionId)) {
          return
        }
        if (actionId === 'paste') {
          if (props.canSend && props.canPaste) {
            props.onPaste()
          }
          return
        }
        if (actionId === 'attachment') {
          return
        }
        const source = getAttachmentSource(actionId)
        if (source && props.canSend && !props.isAttaching) {
          props.onAttachImage?.(source)
        }
      }}
    >
      <TerminalToolsTrigger />
    </MenuView>
  )
}
