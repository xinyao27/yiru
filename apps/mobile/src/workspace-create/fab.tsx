import { View } from 'react-native'

import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { translate } from '~/i18n/translate'

type NewWorkspaceFabProps = {
  onPress: () => void
  disabled?: boolean
}

export function NewWorkspaceFab({ onPress, disabled }: NewWorkspaceFabProps): React.JSX.Element {
  return (
    <View className="bottom-safe-offset-6 absolute right-4">
      <MobileGlassIconButton
        accessibilityLabel={translate('mobile.workspace.actions.newWorkspace', 'New workspace')}
        disabled={disabled}
        icon="plus"
        isProminent
        onPress={onPress}
        size="large"
      />
    </View>
  )
}
