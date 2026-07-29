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
import { mobileSwiftUiGlassButtonStyle } from '../components/glass/swift-ui.ios'
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
      label={pending ? 'Adding attachment' : 'Add attachment'}
      systemImage={pending ? 'ellipsis' : 'plus'}
      modifiers={modifiers}
    >
      <Button label="Camera" systemImage="camera" onPress={() => onSelect('camera')} />
      <Button label="Photos" systemImage="photo.on.rectangle" onPress={() => onSelect('library')} />
      <Button label="Files" systemImage="folder" onPress={() => onSelect('files')} />
    </Menu>
  )
}
