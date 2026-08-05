import { Text } from 'react-native'

import { MobileGlassPressable } from '../components/glass/pressable'
import type { HomePrimaryActionButtonProps } from './primary-action-button-props'

export function HomePrimaryActionButton({
  className,
  containerClassName,
  contentClassName,
  icon: Icon,
  label,
  onPress
}: HomePrimaryActionButtonProps): React.JSX.Element {
  return (
    <MobileGlassPressable
      accessibilityLabel={label}
      className={className}
      containerClassName={containerClassName}
      contentClassName={contentClassName}
      onPress={onPress}
      size="large"
    >
      <Icon size={20} colorClassName="foreground" />
      <Text className="text-foreground text-base">{label}</Text>
    </MobileGlassPressable>
  )
}
