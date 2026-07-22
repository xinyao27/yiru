import { Pressable, Text, View } from 'react-native'

import {
  Check,
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  FileText,
  Plus,
  Trash as Trash2,
  ArrowCounterClockwise as Undo2
} from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { MobileDiffReviewQueueItem } from '../session/mobile-diff-review-queue'
import type { GitMutationMethod } from '../session/mobile-diff-review-screen-model'
import { mobileDiffReviewStyles as styles } from './mobile-diff-review-screen-styles'

type Props = {
  busyAction: string | null
  item: MobileDiffReviewQueueItem
  onAddFileNote: () => void
  onDiscard: (item: MobileDiffReviewQueueItem) => void
  onGitMutation: (method: GitMutationMethod, item: MobileDiffReviewQueueItem) => void
  onMarkReviewed: () => void
  onMoveFile: (direction: 'next' | 'previous') => void
}

export function MobileDiffReviewFooter({
  busyAction,
  item,
  onAddFileNote,
  onDiscard,
  onGitMutation,
  onMarkReviewed,
  onMoveFile
}: Props) {
  return (
    <View className={cn(styles.footer, 'pb-safe-offset-2')}>
      <View className={styles.fileActionRow}>
        {item.canStage ? (
          <Pressable
            className={cn(styles.secondaryButton, 'active:opacity-[0.76]')}
            disabled={busyAction !== null}
            onPress={() => onGitMutation('git.stage', item)}
            accessibilityRole="button"
            accessibilityLabel="Stage file"
          >
            <Plus size={14} colorClassName="accent-muted-foreground" />
            <Text className={styles.secondaryButtonText}>Stage</Text>
          </Pressable>
        ) : null}
        {item.canUnstage ? (
          <Pressable
            className={cn(styles.secondaryButton, 'active:opacity-[0.76]')}
            disabled={busyAction !== null}
            onPress={() => onGitMutation('git.unstage', item)}
            accessibilityRole="button"
            accessibilityLabel="Unstage file"
          >
            <Undo2 size={14} colorClassName="accent-muted-foreground" />
            <Text className={styles.secondaryButtonText}>Unstage</Text>
          </Pressable>
        ) : null}
        {item.canDiscard ? (
          <Pressable
            className={cn(styles.secondaryButton, 'active:opacity-[0.76]')}
            disabled={busyAction !== null}
            onPress={() => onDiscard(item)}
            accessibilityRole="button"
            accessibilityLabel="Discard file"
          >
            <Trash2 size={14} colorClassName="accent-destructive" />
            <Text className={styles.destructiveText}>Discard</Text>
          </Pressable>
        ) : null}
      </View>
      <View className={styles.footerRow}>
        <Pressable
          className={cn(styles.navButton, 'active:opacity-[0.76]')}
          onPress={() => onMoveFile('previous')}
          accessibilityRole="button"
          accessibilityLabel="Previous file"
        >
          <ChevronLeft size={17} colorClassName="accent-foreground" />
        </Pressable>
        <Pressable
          className={cn(styles.footerButton, 'active:opacity-[0.76]')}
          onPress={onAddFileNote}
          accessibilityRole="button"
          accessibilityLabel="Add file note"
        >
          <FileText size={14} colorClassName="accent-muted-foreground" />
          <Text className={styles.footerButtonText}>Note</Text>
        </Pressable>
        <Pressable
          className={cn(
            styles.primaryButton,
            item.isReviewed && styles.primaryButtonDone,
            'active:opacity-[0.76]'
          )}
          onPress={onMarkReviewed}
          accessibilityRole="button"
          accessibilityLabel="Mark file reviewed"
        >
          <Check size={14} colorClassName="accent-primary-foreground" />
          <Text className={styles.primaryButtonText}>
            {item.isReviewed ? 'Reviewed' : 'Mark Reviewed'}
          </Text>
        </Pressable>
        <Pressable
          className={cn(styles.navButton, 'active:opacity-[0.76]')}
          onPress={() => onMoveFile('next')}
          accessibilityRole="button"
          accessibilityLabel="Next file"
        >
          <ChevronRight size={17} colorClassName="accent-foreground" />
        </Pressable>
      </View>
    </View>
  )
}
