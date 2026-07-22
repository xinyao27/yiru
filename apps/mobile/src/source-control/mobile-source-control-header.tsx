import { Pressable, Text, View } from 'react-native'

import {
  CaretLeft as ChevronLeft,
  ArrowSquareOut as ExternalLink,
  ArrowClockwise as RefreshCw,
  X
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { styles } from './mobile-source-control-styles'

type Props = {
  embedded: boolean
  worktreeLabel: string
  ioBusy: boolean
  onBack: () => void
  onRefresh: () => void
  // When set (PR segment ready with a host URL), show open-on-web flush-right of
  // the title so the control stays visible while the PR body scrolls.
  onOpenPrWeb?: () => void
  prNumber?: number | null
}

export function MobileSourceControlHeader({
  embedded,
  worktreeLabel,
  ioBusy,
  onBack,
  onRefresh,
  onOpenPrWeb,
  prNumber = null
}: Props) {
  return (
    <View className={styles.topBar}>
      <Pressable
        className={cn(styles.backButton, 'active:bg-secondary')}
        onPress={onBack}
        hitSlop={8}
        accessibilityLabel={embedded ? 'Close source control' : 'Back to session'}
      >
        {embedded ? (
          <X size={22} colorClassName="accent-muted-foreground" />
        ) : (
          <ChevronLeft size={22} colorClassName="accent-muted-foreground" />
        )}
      </Pressable>
      <View className={styles.titleBlock}>
        <Text className={styles.title} numberOfLines={1}>
          Source Control
        </Text>
        <Text className={styles.meta} numberOfLines={1}>
          {worktreeLabel}
        </Text>
      </View>
      {onOpenPrWeb ? (
        <Pressable
          className={cn(styles.refreshButton, 'active:bg-secondary')}
          onPress={onOpenPrWeb}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel={
            prNumber != null
              ? `Open pull request #${prNumber} on the web`
              : 'Open pull request on the web'
          }
        >
          <ExternalLink size={18} colorClassName="accent-muted-foreground" />
        </Pressable>
      ) : null}
      <Pressable
        className={cn(
          styles.refreshButton,
          ioBusy && styles.refreshButtonDisabled,
          'active:bg-secondary'
        )}
        onPress={onRefresh}
        disabled={ioBusy}
        hitSlop={8}
        accessibilityLabel="Refresh source control"
      >
        <RefreshCw size={18} colorClassName="accent-muted-foreground" />
      </Pressable>
    </View>
  )
}
