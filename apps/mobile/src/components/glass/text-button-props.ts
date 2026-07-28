export type MobileGlassTextButtonProps = {
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
