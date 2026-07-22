import type { RefObject } from 'react'
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native'

import { ArrowClockwise as RefreshCw } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { DiffComment } from '../../../desktop/src/shared/types'
import type { MobileDiffReviewQueueItem } from '../session/mobile-diff-review-queue'
import type {
  ReviewDiffLine,
  ReviewDiffState,
  ReviewScreenState
} from '../session/mobile-diff-review-screen-model'
import { MobileDiffReviewLine } from './mobile-diff-review-line'
import { mobileDiffReviewStyles as styles } from './mobile-diff-review-screen-styles'

type Props = {
  activeHunkIndex: number | null
  commentsByLine: ReadonlyMap<number, DiffComment[]>
  currentItem: MobileDiffReviewQueueItem | null
  diffState: ReviewDiffState
  filteredCount: number
  listRef: RefObject<FlatList<ReviewDiffLine> | null>
  screenState: ReviewScreenState
  staleCommentIds: ReadonlySet<string>
  onAddNote: (lineNumber: number) => void
  onEditNote: (comment: DiffComment) => void
  onRetry: () => void
}

export function MobileDiffReviewBody({
  activeHunkIndex,
  commentsByLine,
  currentItem,
  diffState,
  filteredCount,
  listRef,
  screenState,
  staleCommentIds,
  onAddNote,
  onEditNote,
  onRetry
}: Props) {
  if (screenState.kind === 'loading') {
    return <CenteredState text="Loading review..." busy />
  }
  if (screenState.kind === 'error' || screenState.kind === 'unavailable') {
    return (
      <CenteredState
        title={screenState.kind === 'unavailable' ? 'Review Unavailable' : 'Unable to Load Review'}
        text={screenState.message}
        onRetry={onRetry}
      />
    )
  }
  if (filteredCount === 0) {
    return <CenteredState title="No Reviewable Changes" text="Try a different review filter." />
  }
  if (diffState.kind === 'loading') {
    return <CenteredState text="Loading diff..." busy muted />
  }
  if (diffState.kind !== 'ready') {
    return <DiffUnavailableState diffState={diffState} onRetry={onRetry} />
  }
  return (
    <FlatList
      ref={listRef}
      data={diffState.lines}
      keyExtractor={(_, index) => `${currentItem?.key ?? 'diff'}:${index}`}
      renderItem={({ item, index }) => {
        const lineNumber = item.newLineNumber ?? -1
        const active =
          activeHunkIndex !== null &&
          index >= (diffState.hunks[activeHunkIndex]?.startIndex ?? -1) &&
          index <= (diffState.hunks[activeHunkIndex]?.endIndex ?? -1)
        return (
          <MobileDiffReviewLine
            line={item}
            comments={commentsByLine.get(lineNumber) ?? []}
            staleCommentIds={staleCommentIds}
            active={active}
            onAddNote={onAddNote}
            onEditNote={onEditNote}
          />
        )
      }}
      contentContainerClassName={styles.diffList}
      onScrollToIndexFailed={(info) => {
        listRef.current?.scrollToOffset({
          offset: Math.max(0, info.averageItemLength * info.index),
          animated: true
        })
      }}
      ListFooterComponent={
        diffState.truncated ? (
          <Text className={styles.truncatedText}>Diff truncated for mobile preview.</Text>
        ) : null
      }
    />
  )
}

function DiffUnavailableState({
  diffState,
  onRetry
}: {
  diffState: ReviewDiffState
  onRetry: () => void
}) {
  const title =
    diffState.kind === 'binary'
      ? 'Binary Diff'
      : diffState.kind === 'too-large'
        ? 'Diff Too Large'
        : diffState.kind === 'deleted'
          ? 'Deleted File'
          : 'Diff Unavailable'
  const text =
    diffState.kind === 'binary'
      ? 'This file cannot be rendered as text on mobile.'
      : diffState.kind === 'too-large'
        ? 'This diff is too large for the mobile preview.'
        : diffState.kind === 'deleted'
          ? 'This file was deleted. Add a file note or mark it reviewed.'
          : diffState.kind === 'error'
            ? diffState.message
            : 'Select a file to review.'
  return <CenteredState title={title} text={text} onRetry={onRetry} />
}

function CenteredState({
  busy,
  muted,
  title,
  text,
  onRetry
}: {
  busy?: boolean
  muted?: boolean
  title?: string
  text: string
  onRetry?: () => void
}) {
  return (
    <View className={styles.state}>
      {busy ? (
        <ActivityIndicator
          colorClassName={muted ? 'accent-muted-foreground' : 'accent-foreground'}
        />
      ) : null}
      {title ? <Text className={styles.stateTitle}>{title}</Text> : null}
      <Text className={styles.stateText}>{text}</Text>
      {onRetry ? (
        <Pressable
          className={cn(styles.retryButton, 'active:opacity-[0.76]')}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading review"
        >
          <RefreshCw size={14} colorClassName="accent-foreground" />
          <Text className={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
