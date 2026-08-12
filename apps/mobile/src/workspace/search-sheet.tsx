import { View } from 'react-native'

import { BottomDrawer } from '~/components/bottom-drawer'
import { MobileSearchField } from '~/components/search-field'
import { translate } from '~/i18n/translate'

type WorkspaceSearchSheetProps = {
  onChangeText: (text: string) => void
  onClose: () => void
  value: string
  visible: boolean
}

export function WorkspaceSearchSheet({
  onChangeText,
  onClose,
  value,
  visible
}: WorkspaceSearchSheetProps): React.JSX.Element {
  return (
    <BottomDrawer
      visible={visible}
      onClose={onClose}
      contentScrollable={false}
      title={translate('mobile.workspace.search.title', 'Search workspaces')}
    >
      <View>
        <MobileSearchField
          accessibilityLabel={translate('mobile.workspace.search.label', 'Search workspaces')}
          autoFocus={visible}
          focusKey={visible}
          onChangeText={onChangeText}
          placeholder={translate('mobile.workspace.search.placeholder', 'Search workspaces…')}
          value={value}
        />
      </View>
    </BottomDrawer>
  )
}
