import { Text } from 'react-native'

import { cn } from '~/style/class-names'

import { MobileGlassPressable } from './pressable'

type MobileGlassTextButtonProps = {
  accessibilityLabel?: string
  className?: string
  disabled?: boolean
  isDestructive?: boolean
  isFullWidth?: boolean
  isProminent?: boolean
  label: string
  onPress: () => void
  size?: 'large' | 'regular' | 'small'
}

export function MobileGlassTextButton({
  accessibilityLabel,
  className,
  disabled = false,
  isDestructive = false,
  isFullWidth = false,
  isProminent = false,
  label,
  onPress,
  size = 'regular'
}: MobileGlassTextButtonProps): React.JSX.Element {
  return (
    <MobileGlassPressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      className="rounded-full"
      containerClassName={cn(isFullWidth && 'self-stretch', className)}
      contentClassName={cn(
        'items-center justify-center rounded-full px-4',
        size === 'large' ? 'min-h-11' : size === 'small' ? 'min-h-8' : 'min-h-9'
      )}
      disabled={disabled}
      fallbackClassName={cn(
        (isProminent || isDestructive) && 'border-transparent',
        isProminent && !isDestructive && 'bg-primary',
        isDestructive && 'bg-destructive'
      )}
      onPress={onPress}
      size={size}
      tintColorClassName={
        isDestructive ? 'accent-destructive' : isProminent ? 'accent-primary' : undefined
      }
    >
      <Text
        className={cn(
          'text-sm',
          isProminent || isDestructive ? 'text-primary-foreground' : 'text-foreground'
        )}
      >
        {label}
      </Text>
    </MobileGlassPressable>
  )
}
