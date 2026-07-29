import { cn } from '../../style/class-names'
import {
  ArrowClockwise,
  ArrowDown,
  ArrowUp,
  ArrowSquareOut,
  CaretLeft,
  Check,
  Copy,
  Pencil,
  DotsThree,
  FloppyDisk,
  Gear,
  ListChecks,
  Play,
  Plus,
  SidebarSimple,
  Trash,
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
    case 'delete':
      return Trash
    case 'down':
      return ArrowDown
    case 'external':
      return ArrowSquareOut
    case 'edit':
      return Pencil
    case 'more':
      return DotsThree
    case 'play':
      return Play
    case 'plus':
      return Plus
    case 'refresh':
      return ArrowClockwise
    case 'save':
      return FloppyDisk
    case 'send':
      return ArrowUp
    case 'settings':
      return Gear
    case 'sidebar':
      return SidebarSimple
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
      tintColorClassName={isSelected ? 'accent-primary' : undefined}
    >
      <Icon
        size={size === 'large' ? 20 : size === 'small' ? 16 : 18}
        colorClassName={
          isDestructive
            ? 'accent-destructive'
            : isSelected
              ? 'accent-primary-foreground'
              : 'accent-muted-foreground'
        }
      />
    </MobileGlassPressable>
  )
}
