import type { DiffComment } from '@yiru/workbench-model/workspace'
import { Pressable, Text, View } from 'react-native'

import type { MobileDiffReviewQueueItem } from '~/session/diff/review-queue'
import {
  mobileReviewCountLabel,
  mobileReviewScopeLabel,
  type ReviewDiffState
} from '~/session/diff/review-screen-model'
import { MOBILE_GIT_STATUS_LABELS } from '~/source-control/git-status'
import { cn } from '~/style/class-names'

import { MobileDiffReviewHunkNavigation } from './hunk-navigation'
import { mobileDiffReviewStyles as styles } from './screen-styles'

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
      return 'text-git-added'
    case 'copied':
      return 'text-git-copied'
    case 'deleted':
      return 'text-git-deleted'
    case 'renamed':
      return 'text-git-renamed'
    case 'untracked':
      return 'text-git-untracked'
    case 'modified':
    default:
      return 'text-git-modified'
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
    <View className="bg-background border-b-hairline border-b-border px-4 pt-3 pb-2">
      <View className="flex-row items-center gap-2">
        <View className="w-6 items-center">
          <Text className={cn('font-mono text-xs', badgeColorClassName)}>
            {MOBILE_GIT_STATUS_LABELS[item.status]}
          </Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text className="text-foreground text-sm" numberOfLines={1}>
            {item.filePath}
          </Text>
          <Text className={styles.fileMeta} numberOfLines={1}>
            {mobileReviewScopeLabel(item)}
            {item.oldPath ? ` from ${item.oldPath}` : ''}
          </Text>
        </View>
      </View>
      <View className="mt-2 flex-row flex-wrap items-center gap-2">
        <Text className={styles.fileMeta}>
          {currentIndex + 1}/{filteredCount}
        </Text>
        {item.isReviewed ? <Text className="text-xs text-green-500">Reviewed</Text> : null}
        {item.changedSinceReview ? <Text className="text-xs text-amber-500">Changed</Text> : null}
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
        <View className="mt-2 gap-1">
          {fileNotes.map((note) => (
            <Pressable
              key={note.id}
              className={cn(
                'min-h-11 rounded-xl p-2 active:bg-accent',
                staleCommentIds.has(note.id) && 'border-hairline border-amber-500'
              )}
              accessibilityLabel="Edit file note"
              accessibilityRole="button"
              onPress={() => onEditNote(note)}
            >
              <Text className="text-muted-foreground text-xs leading-5" numberOfLines={2}>
                {note.body}
              </Text>
              {staleCommentIds.has(note.id) ? (
                <Text className={styles.staleText}>Stale</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      <MobileDiffReviewHunkNavigation disabled={hunkDisabled} onJumpHunk={onJumpHunk} />
    </View>
  )
}
