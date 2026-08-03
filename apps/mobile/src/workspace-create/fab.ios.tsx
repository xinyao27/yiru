import { Host } from '@expo/ui/swift-ui'
import { View } from 'react-native'
import { useCSSVariable, useUniwind } from 'uniwind'

import { MobileSwiftUiGlassCircleButton } from '~/components/glass/swift-ui-button.ios'
import { translate } from '~/i18n/translate'
import { resolveCssString } from '~/style/resolve-css-variable'

type NewWorkspaceFabProps = {
  onPress: () => void
  disabled?: boolean
}

export function NewWorkspaceFab({
  onPress,
  disabled = false
}: NewWorkspaceFabProps): React.JSX.Element {
  const { theme } = useUniwind()
  const primaryColor = resolveCssString(useCSSVariable('--color-primary'))

  return (
    <View className="bottom-safe-offset-6 absolute right-4">
      <Host colorScheme={theme} matchContents style={{ backgroundColor: 'transparent' }}>
        <MobileSwiftUiGlassCircleButton
          disabled={disabled}
          isProminent
          label={translate('mobile.workspace.actions.newWorkspace', 'New workspace')}
          size="large"
          systemImage="plus"
          tintColor={primaryColor}
          onPress={onPress}
        />
      </Host>
    </View>
  )
}
