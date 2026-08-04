import { useState } from 'react'
import { Pressable, View } from 'react-native'

import { ActionSheetModal, type ActionSheetAction } from '../components/action-sheet-modal'
import { MobileGlassSurface } from '../components/glass/surface'
import { LoadingIndicator } from '../components/loading-indicator'
import { Camera, Folder, ImageSquare, Plus } from '../components/uniwind-icons'
import { translate } from '../i18n/translate'
import type { MobileImageSource } from './image-source-picker'

type MobileAttachmentMenuProps = {
  disabled: boolean
  pending: boolean
  onSelect: (source: MobileImageSource) => void
}

export function MobileAttachmentMenu({
  disabled,
  pending,
  onSelect
}: MobileAttachmentMenuProps): React.JSX.Element {
  const [visible, setVisible] = useState(false)
  const actions: ActionSheetAction[] = [
    {
      id: 'camera',
      label: translate('mobile.session.attachments.camera', 'Camera'),
      icon: Camera,
      dismiss: 'immediate',
      onPress: () => onSelect('camera')
    },
    {
      id: 'library',
      label: translate('mobile.session.attachments.photos', 'Photos'),
      icon: ImageSquare,
      dismiss: 'immediate',
      onPress: () => onSelect('library')
    },
    {
      id: 'files',
      label: translate('mobile.session.attachments.files', 'Files'),
      icon: Folder,
      dismiss: 'immediate',
      onPress: () => onSelect('files')
    }
  ]
  const accessibilityLabel = pending
    ? translate('mobile.session.attachments.adding', 'Adding attachment')
    : translate('mobile.session.attachments.add', 'Add attachment')

  return (
    <>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        className="h-11 w-11 items-center justify-center"
        disabled={disabled}
        onPress={() => setVisible(true)}
      >
        <MobileGlassSurface
          className="h-9 w-9 overflow-hidden rounded-full"
          isFunctional
          isInteractive={!disabled}
          tintColorClassName="accent-secondary"
        >
          <View
            className={
              disabled
                ? 'h-full w-full items-center justify-center opacity-40'
                : 'h-full w-full items-center justify-center'
            }
          >
            {pending ? (
              <LoadingIndicator size={18} />
            ) : (
              <Plus size={18} colorClassName="accent-muted-foreground" />
            )}
          </View>
        </MobileGlassSurface>
      </Pressable>
      <ActionSheetModal
        visible={visible}
        title={translate('mobile.session.attachments.add', 'Add attachment')}
        actions={actions}
        onClose={() => setVisible(false)}
      />
    </>
  )
}
