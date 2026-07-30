import type { MobileGlassIconButtonProps, MobileGlassIconName } from './icon-button-props'
import { MobileSwiftUiGlassAccessoryButton } from './swift-ui.ios'

function systemImageForIcon(
  icon: MobileGlassIconName
):
  | 'person.badge.plus'
  | 'arrow.clockwise'
  | 'arrow.up.right.square'
  | 'checkmark'
  | 'chevron.left'
  | 'doc.on.doc'
  | 'pencil'
  | 'arrow.down'
  | 'arrow.up'
  | 'checkmark.circle'
  | 'chart.bar.xaxis'
  | 'ellipsis'
  | 'gearshape'
  | 'minus'
  | 'play'
  | 'plus'
  | 'sidebar.left'
  | 'square.and.arrow.down'
  | 'trash'
  | 'xmark' {
  switch (icon) {
    case 'add-person':
      return 'person.badge.plus'
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
    case 'delete':
      return 'trash'
    case 'down':
      return 'arrow.down'
    case 'external':
      return 'arrow.up.right.square'
    case 'edit':
      return 'pencil'
    case 'insights':
      return 'chart.bar.xaxis'
    case 'minus':
      return 'minus'
    case 'more':
      return 'ellipsis'
    case 'play':
      return 'play'
    case 'plus':
      return 'plus'
    case 'refresh':
      return 'arrow.clockwise'
    case 'save':
      return 'square.and.arrow.down'
    case 'send':
      return 'arrow.up'
    case 'settings':
      return 'gearshape'
    case 'sidebar':
      return 'sidebar.left'
  }
}

export function MobileGlassIconButton({
  accessibilityLabel,
  disabled = false,
  icon,
  isDestructive = false,
  isSelected = false,
  onPress,
  size = 'regular'
}: MobileGlassIconButtonProps): React.JSX.Element {
  return (
    <MobileSwiftUiGlassAccessoryButton
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      appearance={isDestructive ? 'destructive' : 'normal'}
      isSelected={isSelected}
      shape="circle"
      size={size}
      systemImage={systemImageForIcon(icon)}
    />
  )
}
