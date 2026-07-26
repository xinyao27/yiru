import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { GitPullRequest as GitPullRequestArrow } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { MobileCreatePrAction } from './create-pr-action'

type Props = {
  action: MobileCreatePrAction
}

export function MobileSourceControlCreatePrEntry({ action }: Props) {
  if (!action.visible) {
    return null
  }
  const enabled = !action.disabled
  return (
    <View className="mt-3 gap-1">
      <Pressable
        className={cn(
          'min-h-11 flex-row items-center justify-center gap-1 rounded-xl bg-primary px-3',
          !enabled && 'bg-secondary border-hairline border-border',
          enabled && 'active:bg-accent'
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
          className={cn(
            'text-primary-foreground text-sm font-bold',
            !enabled && 'text-muted-foreground'
          )}
        >
          {action.label}
        </Text>
      </Pressable>
      {action.hint ? (
        <Text className="text-muted-foreground text-xs leading-4" numberOfLines={2}>
          {action.hint}
        </Text>
      ) : null}
    </View>
  )
}
