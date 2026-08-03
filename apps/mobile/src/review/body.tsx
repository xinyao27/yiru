import type { DiffComment } from '@yiru/workbench-model/workspace'
import type { RefObject } from 'react'
import { ActivityIndicator, FlatList, Text, View } from 'react-native'

import { MobileGlassTextButton } from '~/components/glass/text-button'
import { translate } from '~/i18n/translate'
import type { MobileDiffReviewQueueItem } from '~/session/diff/review-queue'
import type {
  ReviewDiffLine,
  ReviewDiffState,
  ReviewScreenState
} from '~/session/diff/review-screen-model'

import { MobileDiffReviewLine } from './line'

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
}: Props): React.JSX.Element {
  if (screenState.kind === 'loading') {
    return (
      <CenteredState text={translate('mobile.review.body.loading', 'Loading review...')} busy />
    )
  }
  if (screenState.kind === 'error' || screenState.kind === 'unavailable') {
    return (
      <CenteredState
        title={
          screenState.kind === 'unavailable'
            ? translate('mobile.review.body.unavailable', 'Review Unavailable')
            : translate('mobile.review.body.loadFailed', 'Unable to Load Review')
        }
        text={screenState.message}
        onRetry={onRetry}
      />
    )
  }
  if (filteredCount === 0) {
    return (
      <CenteredState
        title={translate('mobile.review.body.emptyTitle', 'No Reviewable Changes')}
        text={translate('mobile.review.body.emptyMessage', 'Try a different review filter.')}
      />
    )
  }
  if (diffState.kind === 'loading') {
    return (
      <CenteredState
        text={translate('mobile.review.body.loadingDiff', 'Loading diff...')}
        busy
        muted
      />
    )
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
      contentContainerClassName="pb-36 bg-editor-surface"
      onScrollToIndexFailed={(info) => {
        listRef.current?.scrollToOffset({
          offset: Math.max(0, info.averageItemLength * info.index),
          animated: true
        })
      }}
      ListFooterComponent={
        diffState.truncated ? (
          <Text className="text-muted-foreground p-3 text-center text-xs">
            {translate('mobile.review.body.truncated', 'Diff truncated for mobile preview.')}
          </Text>
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
}): React.JSX.Element {
  const title =
    diffState.kind === 'binary'
      ? translate('mobile.review.body.binaryTitle', 'Binary Diff')
      : diffState.kind === 'too-large'
        ? translate('mobile.review.body.tooLargeTitle', 'Diff Too Large')
        : diffState.kind === 'deleted'
          ? translate('mobile.review.body.deletedTitle', 'Deleted File')
          : translate('mobile.review.body.diffUnavailable', 'Diff Unavailable')
  const text =
    diffState.kind === 'binary'
      ? translate(
          'mobile.review.body.binaryMessage',
          'This file cannot be rendered as text on mobile.'
        )
      : diffState.kind === 'too-large'
        ? translate(
            'mobile.review.body.tooLargeMessage',
            'This diff is too large for the mobile preview.'
          )
        : diffState.kind === 'deleted'
          ? translate(
              'mobile.review.body.deletedMessage',
              'This file was deleted. Add a file note or mark it reviewed.'
            )
          : diffState.kind === 'error'
            ? diffState.message
            : translate('mobile.review.body.selectFile', 'Select a file to review.')
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
}): React.JSX.Element {
  return (
    <View className="flex-1 items-center justify-center gap-3 p-6">
      {busy ? (
        <ActivityIndicator
          colorClassName={muted ? 'accent-muted-foreground' : 'accent-foreground'}
        />
      ) : null}
      {title ? (
        <Text className="text-foreground text-center text-sm font-bold">{title}</Text>
      ) : null}
      <Text className="text-muted-foreground text-center text-sm leading-5">{text}</Text>
      {onRetry ? (
        <MobileGlassTextButton
          accessibilityLabel={translate(
            'mobile.review.body.retryAccessibility',
            'Retry loading review'
          )}
          label={translate('mobile.review.body.retry', 'Retry')}
          onPress={onRetry}
          size="large"
        />
      ) : null}
    </View>
  )
}
