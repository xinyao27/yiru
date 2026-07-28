import { Host } from '@expo/ui/swift-ui'
import { View } from 'react-native'
import { useUniwind } from 'uniwind'

import { MobileSwiftUiGlassCircleButton } from './glass/swift-ui.ios'

type NewWorkspaceFabProps = {
  onPress: () => void
  disabled?: boolean
}

export function NewWorkspaceFab({
  onPress,
  disabled = false
}: NewWorkspaceFabProps): React.JSX.Element {
  const { theme } = useUniwind()

  return (
    <View className="bottom-safe-offset-6 absolute right-4">
      <Host colorScheme={theme} matchContents style={{ backgroundColor: 'transparent' }}>
        <MobileSwiftUiGlassCircleButton
          disabled={disabled}
          label="New workspace"
          size="large"
          systemImage="plus"
          onPress={onPress}
        />
      </Host>
    </View>
  )
}
