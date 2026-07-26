import { View, Text } from 'react-native'

import { TerminalWindow as SquareTerminal } from '@/components/uniwind-icons'

// Empty detail pane shown beside the worktree-list sidebar on wide
// tablet/foldable layouts until the user opens a workspace.
export function WorkspaceDetailPlaceholder() {
  return (
    <View className="bg-background flex-1 items-center justify-center px-6">
      <View className="bg-card mb-4 h-14 w-14 items-center justify-center rounded-3xl">
        <SquareTerminal size={28} colorClassName="accent-muted-foreground" />
      </View>
      <Text className="text-foreground mb-1 text-sm font-semibold">No workspace open</Text>
      <Text className="text-muted-foreground max-w-80 text-center text-xs">
        Pick a workspace from the sidebar to open its terminal here.
      </Text>
    </View>
  )
}
