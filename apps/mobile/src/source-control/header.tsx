import { Pressable, Text, View } from 'react-native'

import {
  CaretLeft as ChevronLeft,
  ArrowSquareOut as ExternalLink,
  ArrowClockwise as RefreshCw,
  X
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import { styles } from './styles'

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
    <View className="min-h-[58px] flex-row items-center px-2">
      <Pressable
        className={cn('w-9 h-9 items-center justify-center mr-1', 'active:bg-accent')}
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
      <View className="min-w-0 flex-1">
        <Text className="text-foreground text-sm font-bold" numberOfLines={1}>
          Source Control
        </Text>
        <Text className="text-muted-foreground mt-[2px] text-xs" numberOfLines={1}>
          {worktreeLabel}
        </Text>
      </View>
      {onOpenPrWeb ? (
        <Pressable
          className={cn(styles.refreshButton, 'active:bg-accent')}
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
        className={cn(styles.refreshButton, ioBusy && 'opacity-[0.45]', 'active:bg-accent')}
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
