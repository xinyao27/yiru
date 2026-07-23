import type { DiffComment } from '@yiru/workbench-model/workspace'
import { Pressable, Text, View } from 'react-native'

import { ArrowDown, ArrowUp } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { MobileDiffReviewQueueItem } from '../session/mobile-diff-review-queue'
import {
  mobileReviewCountLabel,
  mobileReviewScopeLabel,
  type ReviewDiffState
} from '../session/mobile-diff-review-screen-model'
import { MOBILE_GIT_STATUS_LABELS } from '../source-control/mobile-git-status'
import { mobileDiffReviewStyles as styles } from './mobile-diff-review-screen-styles'

type Props = {
  currentIndex: number
  diffState: ReviewDiffState
  fileNotes: DiffComment[]
  filteredCount: number
  item: MobileDiffReviewQueueItem
  staleCommentIds: ReadonlySet<string>
  onEditNote: (comment: DiffComment) => void
  onJumpHunk: (direction: 'next' | 'previous') => void
}

function statusColorClassName(status: MobileDiffReviewQueueItem['status']): string {
  switch (status) {
    case 'added':
      return 'text-[var(--git-decoration-added)] border-[var(--git-decoration-added)]'
    case 'copied':
      return 'text-[var(--git-decoration-copied)] border-[var(--git-decoration-copied)]'
    case 'deleted':
      return 'text-[var(--git-decoration-deleted)] border-[var(--git-decoration-deleted)]'
    case 'renamed':
      return 'text-[var(--git-decoration-renamed)] border-[var(--git-decoration-renamed)]'
    case 'untracked':
      return 'text-[var(--git-decoration-untracked)] border-[var(--git-decoration-untracked)]'
    case 'modified':
    default:
      return 'text-[var(--git-decoration-modified)] border-[var(--git-decoration-modified)]'
  }
}

export function MobileDiffReviewFileSummary({
  currentIndex,
  diffState,
  fileNotes,
  filteredCount,
  item,
  staleCommentIds,
  onEditNote,
  onJumpHunk
}: Props) {
  const hunkDisabled = diffState.kind !== 'ready' || diffState.hunks.length === 0
  const badgeColorClassName = statusColorClassName(item.status)
  return (
    <View className={styles.fileHeader}>
      <View className={styles.fileTitleRow}>
        <View className={cn(styles.statusBadge, badgeColorClassName)}>
          <Text className={cn(styles.statusBadgeText, badgeColorClassName)}>
            {MOBILE_GIT_STATUS_LABELS[item.status]}
          </Text>
        </View>
        <View className={styles.fileTitleBlock}>
          <Text className={styles.filePath} numberOfLines={1}>
            {item.filePath}
          </Text>
          <Text className={styles.fileMeta} numberOfLines={1}>
            {mobileReviewScopeLabel(item)}
            {item.oldPath ? ` from ${item.oldPath}` : ''}
          </Text>
        </View>
      </View>
      <View className={styles.fileMetaRow}>
        <Text className={styles.fileMeta}>
          {currentIndex + 1}/{filteredCount}
        </Text>
        {item.isReviewed ? <Text className={styles.reviewedPill}>Reviewed</Text> : null}
        {item.changedSinceReview ? <Text className={styles.stalePill}>Changed</Text> : null}
        {item.noteCount > 0 ? (
          <Text className={styles.fileMeta}>
            {mobileReviewCountLabel(item.noteCount, 'note', 'notes')}
          </Text>
        ) : null}
        {item.staleNoteCount > 0 ? (
          <Text className={styles.staleText}>{item.staleNoteCount} stale</Text>
        ) : null}
      </View>
      {fileNotes.length > 0 ? (
        <View className={styles.fileNotes}>
          {fileNotes.map((note) => (
            <Pressable
              key={note.id}
              className={cn(styles.fileNote, 'active:bg-secondary')}
              onPress={() => onEditNote(note)}
              accessibilityRole="button"
              accessibilityLabel="Edit file note"
            >
              <Text className={styles.fileNoteText} numberOfLines={2}>
                {note.body}
              </Text>
              {staleCommentIds.has(note.id) ? (
                <Text className={styles.staleText}>Stale</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      <View className={styles.hunkRow}>
        <Pressable
          className={cn(styles.hunkButton, 'active:bg-secondary')}
          disabled={hunkDisabled}
          onPress={() => onJumpHunk('previous')}
          accessibilityRole="button"
          accessibilityLabel="Previous hunk"
        >
          <ArrowUp size={14} colorClassName="accent-muted-foreground" />
          <Text className={styles.hunkButtonText}>Hunk</Text>
        </Pressable>
        <Pressable
          className={cn(styles.hunkButton, 'active:bg-secondary')}
          disabled={hunkDisabled}
          onPress={() => onJumpHunk('next')}
          accessibilityRole="button"
          accessibilityLabel="Next hunk"
        >
          <ArrowDown size={14} colorClassName="accent-muted-foreground" />
          <Text className={styles.hunkButtonText}>Hunk</Text>
        </Pressable>
      </View>
    </View>
  )
}
