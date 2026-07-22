import { View, Text } from 'react-native'

import { TerminalWindow as SquareTerminal } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

// Empty detail pane shown beside the worktree-list sidebar on wide
// tablet/foldable layouts until the user opens a workspace.
export function WorkspaceDetailPlaceholder() {
  return (
    <View className={styles.container}>
      <View className={styles.icon}>
        <SquareTerminal size={28} colorClassName="accent-muted-foreground" />
      </View>
      <Text className={styles.title}>No workspace open</Text>
      <Text className={styles.body}>
        Pick a workspace from the sidebar to open its terminal here.
      </Text>
    </View>
  )
}

const styles = {
  container: cn('flex-1 items-center justify-center px-6 bg-background'),
  icon: cn('w-14 h-14 rounded-none items-center justify-center bg-card mb-4'),
  title: cn('text-foreground text-[16px] font-semibold mb-1'),
  body: cn('text-muted-foreground text-[13px] text-center max-w-80')
} as const
