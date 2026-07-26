import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import {
  CaretDown as ChevronDown,
  CaretRight as ChevronRight,
  Sparkle as Sparkles
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

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
    <View className="bg-secondary border-hairline border-destructive mt-2 gap-2 p-2">
      <View className="flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <Text className="text-foreground text-sm font-bold">Commit failed</Text>
          <Text className="text-muted-foreground mt-[2px] text-xs leading-[16px]" numberOfLines={2}>
            {action.summary ?? 'Commit failed.'}
          </Text>
        </View>
        <Pressable
          className={cn(
            'min-h-9 px-3 bg-primary flex-row items-center justify-center gap-1',
            action.launching && 'opacity-[0.45]',
            'active:bg-accent'
          )}
          onPress={() => void action.launch()}
          disabled={action.launching}
          accessibilityRole="button"
          accessibilityLabel="Fix commit failure with AI"
        >
          {action.launching ? (
            <ActivityIndicator colorClassName="accent-primary-foreground" />
          ) : (
            <Sparkles size={14} colorClassName="accent-primary-foreground" />
          )}
          <Text className="text-primary-foreground text-xs font-bold">Fix</Text>
        </Pressable>
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
            <Text className="text-muted-foreground font-mono text-xs leading-[17px]">
              {detailsText}
            </Text>
          ) : null}
        </>
      ) : null}
      {action.launchError ? (
        <Text className="text-destructive text-xs leading-[16px]">{action.launchError}</Text>
      ) : null}
    </View>
  )
}
