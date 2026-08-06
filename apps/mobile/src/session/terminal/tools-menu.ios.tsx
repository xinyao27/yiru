import { Button, Menu } from '@expo/ui/swift-ui'
import {
  buttonBorderShape,
  buttonStyle,
  clipShape,
  controlSize,
  disabled as disabledModifier,
  frame,
  glassEffect,
  labelStyle,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { useMemo } from 'react'

import { useMobileGlassAvailable } from '~/components/glass/availability'
import { translate } from '~/i18n/translate'

import type { MobileTerminalToolsMenuProps } from './tools-menu'

const TERMINAL_ACCESSORY_BUTTON_SIZE_PT = 40
const TERMINAL_ACCESSORY_HIT_SIZE_PT = 44

function useTerminalToolsModifiers(disabled: boolean): ViewModifier[] {
  const isGlassAvailable = useMobileGlassAvailable()

  return useMemo(
    () => [
      labelStyle('iconOnly'),
      controlSize('small'),
      buttonStyle(isGlassAvailable ? 'plain' : 'bordered'),
      buttonBorderShape('circle'),
      frame({
        width: TERMINAL_ACCESSORY_BUTTON_SIZE_PT,
        height: TERMINAL_ACCESSORY_BUTTON_SIZE_PT,
        alignment: 'center'
      }),
      ...(isGlassAvailable
        ? [
            glassEffect({
              glass: { variant: 'regular', interactive: true },
              shape: 'circle'
            }),
            clipShape('circle')
          ]
        : []),
      frame({
        minWidth: TERMINAL_ACCESSORY_HIT_SIZE_PT,
        minHeight: TERMINAL_ACCESSORY_HIT_SIZE_PT,
        alignment: 'center'
      }),
      disabledModifier(disabled)
    ],
    [disabled, isGlassAvailable]
  )
}

export function MobileTerminalToolsMenu({
  canPaste,
  canSend,
  isAttaching,
  onAttachImage,
  onPaste
}: MobileTerminalToolsMenuProps): React.JSX.Element {
  const modifiers = useTerminalToolsModifiers(!canSend)
  const menuLabel = translate('mobile.terminal.openAccessoryTools', 'Open terminal tools')

  return (
    <Menu label={menuLabel} systemImage={isAttaching ? 'ellipsis' : 'plus'} modifiers={modifiers}>
      <Button
        label={translate('mobile.terminal.pasteFromClipboard', 'Paste from clipboard')}
        systemImage="doc.on.clipboard"
        modifiers={[disabledModifier(!canSend || !canPaste)]}
        onPress={onPaste}
      />
      {onAttachImage ? (
        <Menu
          label={translate('mobile.session.attachments.add', 'Add attachment')}
          systemImage="paperclip"
          modifiers={[disabledModifier(!canSend || isAttaching)]}
        >
          <Button
            label={translate('mobile.session.attachments.camera', 'Camera')}
            systemImage="camera"
            onPress={() => onAttachImage('camera')}
          />
          <Button
            label={translate('mobile.session.attachments.photos', 'Photos')}
            systemImage="photo.on.rectangle"
            onPress={() => onAttachImage('library')}
          />
          <Button
            label={translate('mobile.session.attachments.files', 'Files')}
            systemImage="folder"
            onPress={() => onAttachImage('files')}
          />
        </Menu>
      ) : null}
    </Menu>
  )
}
