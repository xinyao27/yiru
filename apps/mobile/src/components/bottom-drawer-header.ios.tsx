import { Text, View } from 'react-native'

import type { BottomDrawerHeaderProps } from './bottom-drawer-header-props'
import { ExpoUiHost } from './expo-ui-host'
import { MobileSwiftUiGlassCircleButton } from './glass/swift-ui-button.ios'
import { MobileGlassTextButton } from './glass/text-button'

export function BottomDrawerHeader({
  action,
  leadingAccessibilityLabel,
  onLeadingPress,
  title
}: BottomDrawerHeaderProps): React.JSX.Element {
  return (
    <View className="flex-row items-center gap-4 px-4 pt-4 pb-8">
      <ExpoUiHost>
        <MobileSwiftUiGlassCircleButton
          label={leadingAccessibilityLabel}
          onPress={onLeadingPress}
          size="large"
          systemImage="chevron.left"
        />
      </ExpoUiHost>
      <Text className="text-foreground min-w-0 flex-1 text-base font-semibold" numberOfLines={1}>
        {title}
      </Text>
      {action ? (
        <MobileGlassTextButton
          disabled={action.disabled}
          label={action.label}
          onPress={action.onPress}
          size="small"
        />
      ) : null}
    </View>
  )
}
