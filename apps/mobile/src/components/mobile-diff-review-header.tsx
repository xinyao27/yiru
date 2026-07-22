import { FlatList, Pressable, Text, View } from 'react-native'

import {
  CaretLeft as ChevronLeft,
  ListChecks,
  DotsThree as MoreHorizontal
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { MobileDiffReviewQueueFilter } from '../session/mobile-diff-review-queue'
import { REVIEW_FILTERS, mobileReviewCountLabel } from '../session/mobile-diff-review-screen-model'
import { mobileDiffReviewStyles as styles } from './mobile-diff-review-screen-styles'
import { shouldShowTrigger } from './mobile-pr-sidebar-presentation'

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
    <View className={styles.header}>
      <View className={styles.topBar}>
        <Pressable
          className={cn(styles.iconButton, 'active:bg-secondary')}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={19} colorClassName="accent-foreground" />
        </Pressable>
        <View className={styles.titleBlock}>
          <Text className={styles.title} numberOfLines={1}>
            Changes
          </Text>
          <Text className={styles.subtitle} numberOfLines={1}>
            {worktreeLabel}
          </Text>
        </View>
        {showPRTrigger ? (
          <Pressable
            className={cn(styles.iconButton, 'active:bg-secondary')}
            onPress={onOpenPRSidebar}
            accessibilityRole="button"
            accessibilityLabel="Open pull request sidebar"
          >
            <ListChecks size={19} colorClassName="accent-foreground" />
          </Pressable>
        ) : null}
        <Pressable
          className={cn(styles.iconButton, 'active:bg-secondary')}
          onPress={onOpenActions}
          accessibilityRole="button"
          accessibilityLabel="Open review actions"
        >
          <MoreHorizontal size={19} colorClassName="accent-foreground" />
        </Pressable>
      </View>
      <View className={styles.progressRow}>
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
        contentContainerClassName={styles.filterRow}
        renderItem={({ item }) => (
          <Pressable
            className={cn(
              styles.filterChip,
              filter === item && styles.filterChipActive,
              'active:opacity-[0.78]'
            )}
            onPress={() => onSelectFilter(item)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === item }}
            accessibilityLabel={`Show ${item} review files`}
          >
            <Text className={cn(styles.filterText, filter === item && styles.filterTextActive)}>
              {item === 'all' ? 'All' : item[0]?.toUpperCase() + item.slice(1)}
            </Text>
          </Pressable>
        )}
      />
    </View>
  )
}
