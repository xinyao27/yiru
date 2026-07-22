import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { GitPullRequest as GitPullRequestArrow } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { MobileCreatePrAction } from './mobile-create-pr-action'
import { styles } from './mobile-source-control-styles'

type Props = {
  action: MobileCreatePrAction
}

export function MobileSourceControlCreatePrEntry({ action }: Props) {
  if (!action.visible) {
    return null
  }
  const enabled = !action.disabled
  return (
    <View className={styles.createPrBlock}>
      <Pressable
        className={cn(
          styles.createPrButton,
          !enabled && styles.createPrButtonDisabled,
          enabled && 'active:opacity-[0.78]'
        )}
        disabled={action.disabled}
        onPress={action.onPress}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        accessibilityHint={action.hint}
      >
        {action.loading ? (
          <ActivityIndicator
            size="small"
            colorClassName={enabled ? 'accent-primary-foreground' : 'accent-muted-foreground'}
          />
        ) : (
          <GitPullRequestArrow
            size={16}
            colorClassName={enabled ? 'accent-primary-foreground' : 'accent-muted-foreground'}
          />
        )}
        <Text
          className={cn(styles.createPrButtonText, !enabled && styles.createPrButtonTextDisabled)}
        >
          {action.label}
        </Text>
      </Pressable>
      {action.hint ? (
        <Text className={styles.createPrHint} numberOfLines={2}>
          {action.hint}
        </Text>
      ) : null}
    </View>
  )
}
