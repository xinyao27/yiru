import type { MobileGlassIconButtonProps, MobileGlassIconName } from './icon-button-props'
import { MobileSwiftUiGlassAccessoryButton } from './swift-ui.ios'

function systemImageForIcon(
  icon: MobileGlassIconName
):
  | 'arrow.clockwise'
  | 'arrow.up.right.square'
  | 'checkmark'
  | 'chevron.left'
  | 'doc.on.doc'
  | 'arrow.down'
  | 'arrow.up'
  | 'checkmark.circle'
  | 'ellipsis'
  | 'gearshape'
  | 'play'
  | 'square.and.arrow.down'
  | 'xmark' {
  switch (icon) {
    case 'back':
      return 'chevron.left'
    case 'check':
      return 'checkmark'
    case 'checks':
      return 'checkmark.circle'
    case 'close':
      return 'xmark'
    case 'copy':
      return 'doc.on.doc'
    case 'down':
      return 'arrow.down'
    case 'external':
      return 'arrow.up.right.square'
    case 'more':
      return 'ellipsis'
    case 'play':
      return 'play'
    case 'refresh':
      return 'arrow.clockwise'
    case 'save':
      return 'square.and.arrow.down'
    case 'send':
      return 'arrow.up'
    case 'settings':
      return 'gearshape'
  }
}

export function MobileGlassIconButton({
  accessibilityLabel,
  disabled = false,
  icon,
  onPress,
  size = 'regular'
}: MobileGlassIconButtonProps): React.JSX.Element {
  return (
    <MobileSwiftUiGlassAccessoryButton
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      shape="circle"
      size={size}
      systemImage={systemImageForIcon(icon)}
    />
  )
}
