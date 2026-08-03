import { Host } from '@expo/ui/swift-ui'
import { View } from 'react-native'
import { useUniwind } from 'uniwind'

import { translate } from '~/i18n/translate'

import { MobileSwiftUiGlassCircleButton } from './glass/swift-ui-button.ios'

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
          label={translate('mobile.workspace.actions.newWorkspace', 'New workspace')}
          size="large"
          systemImage="plus"
          onPress={onPress}
        />
      </Host>
    </View>
  )
}
