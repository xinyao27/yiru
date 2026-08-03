import { View, Text } from 'react-native'

import { TerminalWindow as SquareTerminal } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

// Why: wide layouts keep the detail navigator mounted while no workspace is
// selected, so the empty pane must occupy that stable route surface.
export function WorkspaceDetailPlaceholder() {
  return (
    <View className="bg-background flex-1 items-center justify-center px-6">
      <View className="mb-4 h-14 w-14 items-center justify-center">
        <SquareTerminal size={28} colorClassName="accent-muted-foreground" />
      </View>
      <Text className="text-foreground mb-1 text-sm font-semibold">
        {translate('mobile.workspace.empty.title', 'No workspace open')}
      </Text>
      <Text className="text-muted-foreground max-w-80 text-center text-xs">
        {translate(
          'mobile.workspace.empty.description',
          'Pick a workspace from the sidebar to open its terminal here.'
        )}
      </Text>
    </View>
  )
}
