import { View } from 'react-native'

import { MobileGlassIconButton } from '@/components/glass/icon-button'

type NewWorkspaceFabProps = {
  onPress: () => void
  disabled?: boolean
}

export function NewWorkspaceFab({ onPress, disabled }: NewWorkspaceFabProps): React.JSX.Element {
  return (
    <View className="bottom-safe-offset-6 absolute right-4">
      <MobileGlassIconButton
        accessibilityLabel="New workspace"
        disabled={disabled}
        icon="plus"
        onPress={onPress}
        size="large"
      />
    </View>
  )
}
