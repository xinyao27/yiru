import { cn } from 'cnfast'
import type { PressableProps } from 'react-native'

import {
  ArrowClockwise,
  ArrowDown,
  ArrowUp,
  ArrowSquareOut,
  ArrowSquareRight,
  CaretLeft,
  CaretRight,
  ChartBar,
  Check,
  Copy,
  DotsThree,
  FloppyDisk,
  Folder,
  Gear,
  GitMerge,
  ListChecks,
  Minus,
  Pencil,
  Play,
  Plus,
  SidebarSimple,
  TerminalWindow,
  Trash,
  UserCircle,
  UserPlus,
  X,
  type Icon
} from '../uniwind-icons'
import { MobileGlassPressable } from './pressable'

type MobileGlassIconName =
  | 'account'
  | 'add-person'
  | 'back'
  | 'check'
  | 'checks'
  | 'close'
  | 'copy'
  | 'delete'
  | 'down'
  | 'edit'
  | 'external'
  | 'folder'
  | 'forward'
  | 'insights'
  | 'minus'
  | 'more'
  | 'play'
  | 'plus'
  | 'quick-commands'
  | 'refresh'
  | 'save'
  | 'send'
  | 'settings'
  | 'sidebar'
  | 'source-control'
  | 'terminal'

type MobileGlassIconButtonProps = {
  accessibilityLabel: string
  disabled?: boolean
  hitSlop?: PressableProps['hitSlop']
  icon: MobileGlassIconName
  isDestructive?: boolean
  isProminent?: boolean
  isSelected?: boolean
  onPress: NonNullable<PressableProps['onPress']>
  size?: 'large' | 'regular' | 'small'
}

function iconForName(name: MobileGlassIconName): Icon {
  switch (name) {
    case 'account':
      return UserCircle
    case 'add-person':
      return UserPlus
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
    case 'folder':
      return Folder
    case 'forward':
      return CaretRight
    case 'edit':
      return Pencil
    case 'insights':
      return ChartBar
    case 'minus':
      return Minus
    case 'more':
      return DotsThree
    case 'play':
      return Play
    case 'plus':
      return Plus
    case 'quick-commands':
      return ArrowSquareRight
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
    case 'source-control':
      return GitMerge
    case 'terminal':
      return TerminalWindow
  }
}

export function MobileGlassIconButton({
  accessibilityLabel,
  disabled = false,
  hitSlop,
  icon,
  isDestructive = false,
  isProminent = false,
  isSelected,
  onPress,
  size = 'regular'
}: MobileGlassIconButtonProps): React.JSX.Element {
  const Icon = iconForName(icon)
  const selected = isSelected === true
  const hasPrimaryFill = !isDestructive && (selected || isProminent)

  return (
    <MobileGlassPressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{
        disabled,
        ...(isSelected === undefined ? {} : { selected: isSelected })
      }}
      className={cn(
        'rounded-full',
        size === 'large' ? 'h-11 w-11' : size === 'small' ? 'h-8 w-8' : 'h-9 w-9'
      )}
      containerClassName="w-11 items-center"
      contentClassName="h-full w-full items-center justify-center rounded-full"
      disabled={disabled}
      fallbackClassName={hasPrimaryFill ? 'bg-primary' : undefined}
      hitSlop={hitSlop}
      onPress={onPress}
      size={size}
      tintColorClassName={
        isDestructive ? 'accent-destructive' : hasPrimaryFill ? 'accent-primary' : undefined
      }
    >
      <Icon
        size={size === 'large' ? 20 : size === 'small' ? 16 : 18}
        colorClassName={
          isDestructive
            ? 'accent-destructive'
            : hasPrimaryFill
              ? 'accent-primary-foreground'
              : 'accent-muted-foreground'
        }
      />
    </MobileGlassPressable>
  )
}
