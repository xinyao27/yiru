import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { CaretDown as ChevronDown, CaretRight as ChevronRight } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { MobileGlassTextButton } from '../components/glass/text-button'
import type { MobileCommitFailureRecovery } from './commit-failure-recovery'
import type { MobileCommitFailureRecoveryAction } from './use-commit-failure-recovery'

type Props = {
  failure: MobileCommitFailureRecovery
  action: MobileCommitFailureRecoveryAction
}

export function MobileCommitFailurePanel({ failure, action }: Props) {
  const [expanded, setExpanded] = useState(false)
  const Chevron = expanded ? ChevronDown : ChevronRight
  const detailsText = failure.error.trim()

  return (
    <View className="border-hairline border-destructive bg-secondary mt-2 gap-2 rounded-2xl p-2">
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <Text className="text-foreground text-sm font-bold">Commit failed</Text>
          <Text className="text-muted-foreground mt-0.5 text-xs leading-4" numberOfLines={2}>
            {action.summary ?? 'Commit failed.'}
          </Text>
        </View>
        {action.launching ? (
          <ActivityIndicator colorClassName="accent-muted-foreground" />
        ) : (
          <MobileGlassTextButton
            accessibilityLabel="Fix commit failure with AI"
            disabled={action.launching}
            isProminent
            label="Fix"
            onPress={() => void action.launch()}
            size="small"
          />
        )}
      </View>
      {action.hasDetails && detailsText ? (
        <>
          <Pressable
            className={cn('min-h-8 flex-row items-center gap-1', 'active:bg-accent')}
            onPress={() => setExpanded((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={
              expanded ? 'Hide commit failure details' : 'Show commit failure details'
            }
          >
            <Chevron size={14} colorClassName="accent-muted-foreground" />
            <Text className="text-muted-foreground text-xs font-semibold">
              {expanded ? 'Hide details' : 'Show details'}
            </Text>
          </Pressable>
          {expanded ? (
            <Text className="text-muted-foreground font-mono text-xs leading-5">{detailsText}</Text>
          ) : null}
        </>
      ) : null}
      {action.launchError ? (
        <Text className="text-destructive text-xs leading-4">{action.launchError}</Text>
      ) : null}
    </View>
  )
}
