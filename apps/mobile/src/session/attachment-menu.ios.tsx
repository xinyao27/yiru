import { Button, Menu } from '@expo/ui/swift-ui'
import {
  buttonBorderShape,
  controlSize,
  disabled as disabledModifier,
  labelStyle,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { useMemo } from 'react'

import { useMobileGlassAvailable } from '../components/glass/availability'
import { mobileSwiftUiGlassButtonStyle } from '../components/glass/swift-ui-button.ios'
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
  const isGlassAvailable = useMobileGlassAvailable()
  const modifiers = useMemo<ViewModifier[]>(
    () => [
      labelStyle('iconOnly'),
      controlSize('large'),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable),
      buttonBorderShape('circle'),
      disabledModifier(disabled)
    ],
    [disabled, isGlassAvailable]
  )

  return (
    <Menu
      label={
        pending
          ? translate('mobile.session.attachments.adding', 'Adding attachment')
          : translate('mobile.session.attachments.add', 'Add attachment')
      }
      systemImage={pending ? 'ellipsis' : 'plus'}
      modifiers={modifiers}
    >
      <Button
        label={translate('mobile.session.attachments.camera', 'Camera')}
        systemImage="camera"
        onPress={() => onSelect('camera')}
      />
      <Button
        label={translate('mobile.session.attachments.photos', 'Photos')}
        systemImage="photo.on.rectangle"
        onPress={() => onSelect('library')}
      />
      <Button
        label={translate('mobile.session.attachments.files', 'Files')}
        systemImage="folder"
        onPress={() => onSelect('files')}
      />
    </Menu>
  )
}
