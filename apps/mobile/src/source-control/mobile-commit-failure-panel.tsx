import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import {
  CaretDown as ChevronDown,
  CaretRight as ChevronRight,
  Sparkle as Sparkles
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { MobileCommitFailureRecovery } from './mobile-commit-failure-recovery'
import { styles } from './mobile-source-control-styles'
import type { MobileCommitFailureRecoveryAction } from './use-mobile-commit-failure-recovery'

type Props = {
  failure: MobileCommitFailureRecovery
  action: MobileCommitFailureRecoveryAction
}

export function MobileCommitFailurePanel({ failure, action }: Props) {
  const [expanded, setExpanded] = useState(false)
  const Chevron = expanded ? ChevronDown : ChevronRight
  const detailsText = failure.error.trim()

  return (
    <View className={styles.commitFailurePanel}>
      <View className={styles.commitFailureHeader}>
        <View className={styles.commitFailureTextBlock}>
          <Text className={styles.commitFailureTitle}>Commit failed</Text>
          <Text className={styles.commitFailureSummary} numberOfLines={2}>
            {action.summary ?? 'Commit failed.'}
          </Text>
        </View>
        <Pressable
          className={cn(
            styles.commitFailureFixButton,
            action.launching && styles.commitFailureFixButtonDisabled,
            'active:opacity-[0.75]'
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
          <Text className={styles.commitFailureFixButtonText}>Fix</Text>
        </Pressable>
      </View>
      {action.hasDetails && detailsText ? (
        <>
          <Pressable
            className={cn(styles.commitFailureDetailsButton, 'active:opacity-[0.75]')}
            onPress={() => setExpanded((current) => !current)}
            accessibilityRole="button"
            accessibilityLabel={
              expanded ? 'Hide commit failure details' : 'Show commit failure details'
            }
          >
            <Chevron size={14} colorClassName="accent-muted-foreground" />
            <Text className={styles.commitFailureDetailsButtonText}>
              {expanded ? 'Hide details' : 'Show details'}
            </Text>
          </Pressable>
          {expanded ? <Text className={styles.commitFailureDetailsText}>{detailsText}</Text> : null}
        </>
      ) : null}
      {action.launchError ? (
        <Text className={styles.commitFailureLaunchError}>{action.launchError}</Text>
      ) : null}
    </View>
  )
}
