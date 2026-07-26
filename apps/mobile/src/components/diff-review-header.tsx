import { FlatList, Pressable, Text, View } from 'react-native'

import {
  CaretLeft as ChevronLeft,
  ListChecks,
  DotsThree as MoreHorizontal
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { MobileDiffReviewQueueFilter } from '../session/diff/review-queue'
import { REVIEW_FILTERS, mobileReviewCountLabel } from '../session/diff/review-screen-model'
import { mobileDiffReviewStyles as styles } from './diff-review-screen-styles'
import { shouldShowTrigger } from './pr-sidebar-presentation'

type Props = {
  filter: MobileDiffReviewQueueFilter
  isWideLayout: boolean
  prSidebarIsGithubRepo: boolean
  prSidebarCanDock: boolean
  queueLength: number
  reviewedCount: number
  unsentCount: number
  worktreeLabel: string
  onBack: () => void
  onOpenActions: () => void
  onOpenPRSidebar: () => void
  onSelectFilter: (filter: MobileDiffReviewQueueFilter) => void
}

export function MobileDiffReviewHeader({
  filter,
  isWideLayout,
  prSidebarIsGithubRepo,
  prSidebarCanDock,
  queueLength,
  reviewedCount,
  unsentCount,
  worktreeLabel,
  onBack,
  onOpenActions,
  onOpenPRSidebar,
  onSelectFilter
}: Props) {
  // The dedicated PR icon appears on any GitHub repo in narrow/overlay mode; in wide
  // mode the sidebar is docked, so it is hidden (not disabled).
  const showPRTrigger = shouldShowTrigger({
    isGithubRepo: prSidebarIsGithubRepo,
    isWideLayout,
    canDock: prSidebarCanDock
  })
  return (
    <View className="border-b-hairline border-b-border px-4 pb-2">
      <View className="min-h-[50px] flex-row items-center gap-2">
        <Pressable
          className={cn(styles.iconButton, 'active:bg-accent')}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={19} colorClassName="accent-foreground" />
        </Pressable>
        <View className="min-w-0 flex-1">
          <Text className="text-foreground text-sm font-bold" numberOfLines={1}>
            Changes
          </Text>
          <Text className="text-muted-foreground/60 mt-[2px] text-xs" numberOfLines={1}>
            {worktreeLabel}
          </Text>
        </View>
        {showPRTrigger ? (
          <Pressable
            className={cn(styles.iconButton, 'active:bg-accent')}
            onPress={onOpenPRSidebar}
            accessibilityRole="button"
            accessibilityLabel="Open pull request sidebar"
          >
            <ListChecks size={19} colorClassName="accent-foreground" />
          </Pressable>
        ) : null}
        <Pressable
          className={cn(styles.iconButton, 'active:bg-accent')}
          onPress={onOpenActions}
          accessibilityRole="button"
          accessibilityLabel="Open review actions"
        >
          <MoreHorizontal size={19} colorClassName="accent-foreground" />
        </Pressable>
      </View>
      <View className="flex-row justify-between gap-3">
        <Text className={styles.progressText}>
          {reviewedCount}/{queueLength} reviewed
        </Text>
        <Text className={styles.progressText}>
          {mobileReviewCountLabel(unsentCount, 'unsent note', 'unsent notes')}
        </Text>
      </View>
      <FlatList
        data={REVIEW_FILTERS}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item}
        contentContainerClassName="gap-2 pt-3 pb-1"
        renderItem={({ item }) => (
          <Pressable
            className={cn(
              'min-h-[34px] px-3 items-center justify-center bg-card border-hairline border-border',
              filter === item && 'border-border bg-accent',
              'active:bg-accent'
            )}
            onPress={() => onSelectFilter(item)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === item }}
            accessibilityLabel={`Show ${item} review files`}
          >
            <Text
              className={cn(
                'text-muted-foreground text-xs font-bold',
                filter === item && 'text-accent-foreground'
              )}
            >
              {item === 'all' ? 'All' : item[0]?.toUpperCase() + item.slice(1)}
            </Text>
          </Pressable>
        )}
      />
    </View>
  )
}
