import { cn } from '../../style/class-names'
import {
  ArrowClockwise,
  ArrowDown,
  ArrowUp,
  ArrowSquareOut,
  CaretLeft,
  Check,
  Copy,
  DotsThree,
  FloppyDisk,
  Gear,
  ListChecks,
  Play,
  X,
  type Icon
} from '../uniwind-icons'
import type { MobileGlassIconButtonProps, MobileGlassIconName } from './icon-button-props'
import { MobileGlassPressable } from './pressable'

function iconForName(name: MobileGlassIconName): Icon {
  switch (name) {
    case 'back':
      return CaretLeft
    case 'check':
      return Check
    case 'checks':
      return ListChecks
    case 'close':
      return X
    case 'copy':
      return Copy
    case 'down':
      return ArrowDown
    case 'external':
      return ArrowSquareOut
    case 'more':
      return DotsThree
    case 'play':
      return Play
    case 'refresh':
      return ArrowClockwise
    case 'save':
      return FloppyDisk
    case 'send':
      return ArrowUp
    case 'settings':
      return Gear
  }
}

export function MobileGlassIconButton({
  accessibilityLabel,
  disabled = false,
  icon,
  onPress,
  size = 'regular'
}: MobileGlassIconButtonProps): React.JSX.Element {
  const Icon = iconForName(icon)

  return (
    <MobileGlassPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      className={cn(
        'rounded-full',
        size === 'large' ? 'h-11 w-11' : size === 'small' ? 'h-8 w-8' : 'h-9 w-9'
      )}
      contentClassName="h-full w-full items-center justify-center rounded-full"
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
    >
      <Icon
        size={size === 'large' ? 20 : size === 'small' ? 16 : 18}
        colorClassName="accent-muted-foreground"
      />
    </MobileGlassPressable>
  )
}
