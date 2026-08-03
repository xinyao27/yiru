import { cn } from 'cnfast'
import { ActivityIndicator, Text, View } from 'react-native'

import { MobileGlassPressable } from '~/components/glass/pressable'
import { GitPullRequest as GitPullRequestArrow } from '~/components/uniwind-icons'

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
      <MobileGlassPressable
        accessibilityHint={action.hint}
        accessibilityLabel={action.label}
        accessibilityRole="button"
        className="min-h-11 rounded-full"
        contentClassName="min-h-11 flex-row items-center justify-center gap-1 rounded-full px-3"
        disabled={action.disabled}
        fallbackClassName={enabled ? 'border-transparent bg-primary' : 'bg-secondary'}
        onPress={action.onPress}
        tintColorClassName={enabled ? 'accent-primary' : undefined}
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
            'text-primary-foreground text-sm font-semibold',
            !enabled && 'text-muted-foreground'
          )}
        >
          {action.label}
        </Text>
      </MobileGlassPressable>
      {action.hint ? (
        <Text className="text-muted-foreground text-xs leading-4" numberOfLines={2}>
          {action.hint}
        </Text>
      ) : null}
    </View>
  )
}
