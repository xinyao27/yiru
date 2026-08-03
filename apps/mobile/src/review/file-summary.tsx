import type { DiffComment } from '@yiru/workbench-model/workspace'
import { Pressable, Text, View } from 'react-native'

import { translate } from '~/i18n/translate'
import type { MobileDiffReviewQueueItem } from '~/session/diff/review-queue'
import { mobileReviewCountLabel, type ReviewDiffState } from '~/session/diff/review-screen-model'
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

function reviewScopeLabel(item: MobileDiffReviewQueueItem): string {
  if (item.scope === 'branch') {
    return translate('mobile.review.file.scope.branch', 'Branch')
  }
  return item.scope === 'staged'
    ? translate('mobile.review.file.scope.staged', 'Staged')
    : translate('mobile.review.file.scope.unstaged', 'Unstaged')
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
}: Props): React.JSX.Element {
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
            {reviewScopeLabel(item)}
            {item.oldPath
              ? translate('mobile.review.file.previousPath', ' from {{path}}', {
                  path: item.oldPath
                })
              : ''}
          </Text>
        </View>
      </View>
      <View className="mt-2 flex-row flex-wrap items-center gap-2">
        <Text className={styles.fileMeta}>
          {currentIndex + 1}/{filteredCount}
        </Text>
        {item.isReviewed ? (
          <Text className="text-xs text-green-500">
            {translate('mobile.review.file.reviewed', 'Reviewed')}
          </Text>
        ) : null}
        {item.changedSinceReview ? (
          <Text className="text-xs text-amber-500">
            {translate('mobile.review.file.changed', 'Changed')}
          </Text>
        ) : null}
        {item.noteCount > 0 ? (
          <Text className={styles.fileMeta}>
            {mobileReviewCountLabel(
              item.noteCount,
              translate('mobile.review.file.note', 'note'),
              translate('mobile.review.file.notes', 'notes')
            )}
          </Text>
        ) : null}
        {item.staleNoteCount > 0 ? (
          <Text className={styles.staleText}>
            {translate('mobile.review.file.staleCount', '{{count}} stale', {
              count: item.staleNoteCount
            })}
          </Text>
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
              accessibilityLabel={translate(
                'mobile.review.file.editNoteAccessibility',
                'Edit file note'
              )}
              accessibilityRole="button"
              onPress={() => onEditNote(note)}
            >
              <Text className="text-muted-foreground text-xs leading-5" numberOfLines={2}>
                {note.body}
              </Text>
              {staleCommentIds.has(note.id) ? (
                <Text className={styles.staleText}>
                  {translate('mobile.review.file.stale', 'Stale')}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
      <MobileDiffReviewHunkNavigation disabled={hunkDisabled} onJumpHunk={onJumpHunk} />
    </View>
  )
}
