import { useState } from 'react'
import { Pressable, View } from 'react-native'

import { ActionSheetModal, type ActionSheetAction } from '~/components/action-sheet-modal'
import { MobileGlassSurface } from '~/components/glass/surface'
import { Camera, Clipboard, Folder, ImageSquare, Plus } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import type { MobileImageSource } from '../image-source-picker'
import type { MobileTerminalToolsMenuProps } from './tools-menu'

function TerminalToolsTrigger({ onPress }: { onPress: () => void }): React.JSX.Element {
  return (
    <Pressable
      accessibilityLabel={translate('mobile.terminal.openAccessoryTools', 'Open terminal tools')}
      accessibilityRole="button"
      className="h-11 w-11 items-center justify-center"
      onPress={onPress}
    >
      <MobileGlassSurface
        className="h-9 w-9 overflow-hidden rounded-full"
        fallbackClassName="border-transparent bg-secondary"
        isFunctional
        isInteractive
        tintColorClassName="accent-accent"
      >
        <View className="h-full w-full items-center justify-center">
          <Plus size={18} colorClassName="accent-muted-foreground" />
        </View>
      </MobileGlassSurface>
    </Pressable>
  )
}

function AttachmentActions({
  canSend,
  onAttachImage,
  onClose
}: {
  canSend: boolean
  onAttachImage: (source: MobileImageSource) => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <ActionSheetModal
      visible
      title={translate('mobile.session.attachments.add', 'Add attachment')}
      actions={
        [
          {
            id: 'camera',
            label: translate('mobile.session.attachments.camera', 'Camera'),
            icon: Camera,
            disabled: !canSend,
            dismiss: 'immediate',
            onPress: () => onAttachImage('camera')
          },
          {
            id: 'library',
            label: translate('mobile.session.attachments.photos', 'Photos'),
            icon: ImageSquare,
            disabled: !canSend,
            dismiss: 'immediate',
            onPress: () => onAttachImage('library')
          },
          {
            id: 'files',
            label: translate('mobile.session.attachments.files', 'Files'),
            icon: Folder,
            disabled: !canSend,
            dismiss: 'immediate',
            onPress: () => onAttachImage('files')
          }
        ] satisfies ActionSheetAction[]
      }
      onClose={onClose}
    />
  )
}

export function MobileTerminalToolsMenu(props: MobileTerminalToolsMenuProps): React.JSX.Element {
  const [visible, setVisible] = useState(false)
  const [attachmentsVisible, setAttachmentsVisible] = useState(false)
  const actions: ActionSheetAction[] = [
    {
      id: 'paste',
      label: translate('mobile.terminal.pasteFromClipboard', 'Paste from clipboard'),
      icon: Clipboard,
      disabled: !props.canSend || !props.canPaste,
      dismiss: 'immediate',
      onPress: props.onPaste
    }
  ]

  if (props.onAttachImage) {
    actions.push({
      id: 'attachment',
      label: translate('mobile.session.attachments.add', 'Add attachment'),
      icon: ImageSquare,
      disabled: !props.canSend || props.isAttaching,
      dismiss: 'immediate',
      onPress: () => setAttachmentsVisible(true)
    })
  }

  return (
    <>
      <TerminalToolsTrigger onPress={() => setVisible(true)} />
      <ActionSheetModal
        visible={visible}
        title={translate('mobile.terminal.accessoryToolsTitle', 'Terminal tools')}
        actions={actions}
        onClose={() => setVisible(false)}
      />
      {props.onAttachImage && attachmentsVisible ? (
        <AttachmentActions
          canSend={props.canSend}
          onAttachImage={props.onAttachImage}
          onClose={() => setAttachmentsVisible(false)}
        />
      ) : null}
    </>
  )
}
