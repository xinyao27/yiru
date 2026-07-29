import type { GitHubWorkItemDetails, PRState } from '@yiru/workbench-model/review'
import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'

import { MobileGlassSegmentedControl } from '@/components/glass/segmented-control'
import type { MobileGlassSegmentOption } from '@/components/glass/segmented-control-props'
import { CaretDown as ChevronDown, CaretRight as ChevronRight } from '@/components/uniwind-icons'

import { canAddRootComment } from '../../session/pr/comment-actions'
import { isPrSidebarDetailsPlaceholder } from '../../session/pr/sidebar-state'
import type { MobilePrCommentActions } from '../../session/pr/use-comment-actions'
import { MobileGlassTextButton } from '../glass/text-button'
import { CommentMarkdown } from './comment-markdown'
import {
  PR_COMMENT_AUDIENCE_FILTERS,
  filterPRCommentsByAudience,
  getPRCommentAudienceCounts,
  getPRCommentAudienceEmptyLabel,
  type PRCommentAudienceFilter
} from './pr-comment-audience'
import { PRCommentCard, type PRCommentCardActions } from './pr-comment-card'
import { PRCommentComposer } from './pr-comment-composer'
import {
  getPRCommentGroupCount,
  getPRCommentGroupId,
  getPRCommentGroupRoot,
  groupPRComments,
  isResolvedPRCommentGroup,
  type PRCommentGroup
} from './pr-comment-groups'
import { prCommentsStyles as styles } from './pr-comments-styles'
import { PRSection } from './pr-section'
import { mobilePrSidebarStyles as shared } from './styles'

type Props = {
  details: GitHubWorkItemDetails | null
  // The PR conversation state — gates the root-comment composer (open PRs only).
  prState: PRState | null
  // Repo slug for the slug-addressed comment edit/delete RPCs; threaded into the
  // per-card actions so the edit/delete affordances can gate on its presence.
  // Interactive comment actions (reply/resolve/add/edit/delete). Absent (e.g.
  // non-PR) leaves the timeline read-only.
  actions?: MobilePrCommentActions
  // Author logins manually marked as bots on desktop; keeps the Humans/Bots
  // tabs classifying the same comments as the desktop panel.
  botAuthorOverrides?: ReadonlySet<string>
}

// Render comments in bounded pages — the whole sidebar is one ScrollView (can't
// virtualize a nested list), so eagerly rendering a large set parses markdown for
// every comment synchronously and ANRs the JS thread. Start small, reveal in chunks.
const COMMENT_PAGE = 12

// PR body + full comment timeline, mirroring the desktop PR page: a Description
// card, then a Comments section with an audience filter (PRs only), threaded
// review comments, reactions, and collapsible resolved threads.
export function PRCommentsSection({ details, prState, actions, botAuthorOverrides }: Props) {
  // details is null while phase 2 (the heavy comments/body payload) is still loading.
  // A synthetic placeholder means phase 2 failed — do not paint that as empty success.
  const loadingDetails = details === null
  const detailsFailed = details != null && isPrSidebarDetailsPlaceholder(details)
  const body = details?.body ?? ''
  const comments = useMemo(
    () => (details && !isPrSidebarDetailsPlaceholder(details) ? details.comments : []),
    [details]
  )
  const isPr = details != null && !detailsFailed && details.item.type === 'pr'

  // Per-card action bundle (stable callbacks from the hook) — built once so the
  // memo'd cards don't re-render on unrelated timeline changes.
  const cardActions = useMemo<PRCommentCardActions | undefined>(
    () =>
      actions && isPr
        ? {
            reply: actions.reply,
            toggleResolve: actions.toggleResolve,
            isReplyBusy: actions.isReplyBusy,
            isResolveBusy: actions.isResolveBusy
          }
        : undefined,
    [actions, isPr]
  )
  const canComment = isPr && actions !== undefined && canAddRootComment(prState)

  const [filter, setFilter] = useState<PRCommentAudienceFilter>('all')
  const counts = useMemo(
    () => getPRCommentAudienceCounts(comments, botAuthorOverrides),
    [botAuthorOverrides, comments]
  )
  const audienceOptions = useMemo<MobileGlassSegmentOption<PRCommentAudienceFilter>[]>(
    () =>
      PR_COMMENT_AUDIENCE_FILTERS.map((option) => ({
        label: `${option.label} ${counts[option.value]}`,
        value: option.value
      })),
    [counts]
  )
  const visible = useMemo(
    () => filterPRCommentsByAudience(comments, filter, botAuthorOverrides),
    [botAuthorOverrides, comments, filter]
  )
  const groups = useMemo(() => groupPRComments(visible), [visible])

  // Bounded render window; reset to the first page when the user selects another filter.
  const [limit, setLimit] = useState(COMMENT_PAGE)
  const selectFilter = (nextFilter: PRCommentAudienceFilter): void => {
    if (nextFilter === filter) {
      return
    }
    // Why: paging belongs to the filter-tab event, so reset it in the same batch
    // instead of briefly rendering the new filter with the previous page size.
    setLimit(COMMENT_PAGE)
    setFilter(nextFilter)
  }
  const shownGroups = groups.slice(0, limit)
  const remaining = groups.length - shownGroups.length

  return (
    <>
      <PRSection title="Description">
        {loadingDetails ? (
          <ActivityIndicator colorClassName="accent-muted-foreground" />
        ) : detailsFailed ? (
          <Text className={styles.noDescription}>
            Could not load description. Tap refresh to try again.
          </Text>
        ) : body.trim() ? (
          <CommentMarkdown content={body} variant="document" />
        ) : (
          <Text className={styles.noDescription}>No description provided.</Text>
        )}
      </PRSection>

      <PRSection
        title="Comments"
        trailing={
          comments.length > 0 ? (
            <View className="border-hairline border-border bg-secondary rounded-full px-2 py-1">
              <Text className="text-muted-foreground text-xs font-semibold">{comments.length}</Text>
            </View>
          ) : undefined
        }
      >
        {loadingDetails ? (
          <ActivityIndicator colorClassName="accent-muted-foreground" />
        ) : detailsFailed ? (
          <Text className={styles.empty}>Could not load comments. Tap refresh to try again.</Text>
        ) : (
          <View className="gap-2">
            {comments.length === 0 ? (
              <Text className={styles.empty}>No comments yet.</Text>
            ) : (
              <>
                {isPr ? (
                  <MobileGlassSegmentedControl
                    accessibilityLabel="Comment audience"
                    options={audienceOptions}
                    size="small"
                    value={filter}
                    onChange={selectFilter}
                  />
                ) : null}
                {visible.length === 0 ? (
                  <Text className={styles.empty}>{getPRCommentAudienceEmptyLabel(filter)}</Text>
                ) : (
                  <>
                    {shownGroups.map((group) => (
                      <CommentGroupView
                        key={getPRCommentGroupId(group)}
                        group={group}
                        actions={cardActions}
                      />
                    ))}
                    {remaining > 0 ? (
                      <MobileGlassTextButton
                        isFullWidth
                        label={`Show ${Math.min(remaining, COMMENT_PAGE)} more${
                          remaining > COMMENT_PAGE ? ` of ${remaining}` : ''
                        }`}
                        onPress={() => setLimit((l) => l + COMMENT_PAGE)}
                        size="regular"
                      />
                    ) : null}
                  </>
                )}
              </>
            )}
            {actions?.error ? (
              <Text className="text-destructive text-xs">{actions.error}</Text>
            ) : null}
            {canComment && actions ? (
              <View className="gap-2">
                <PRCommentComposer
                  placeholder="Add a comment…"
                  submitLabel="Comment"
                  submitting={actions.isRootBusy}
                  onSubmit={actions.addRootComment}
                />
              </View>
            ) : null}
          </View>
        )}
      </PRSection>
    </>
  )
}

function CommentGroupView({
  group,
  actions
}: {
  group: PRCommentGroup
  actions?: PRCommentCardActions
}) {
  const [expanded, setExpanded] = useState(false)
  const cards =
    group.kind === 'thread'
      ? [
          <PRCommentCard key={group.root.id} comment={group.root} actions={actions} />,
          ...group.replies.map((reply) => (
            <PRCommentCard key={reply.id} comment={reply} isReply actions={actions} />
          ))
        ]
      : [<PRCommentCard key={group.comment.id} comment={group.comment} actions={actions} />]

  if (!isResolvedPRCommentGroup(group)) {
    return <View className={styles.group}>{cards}</View>
  }

  // Resolved threads collapse behind a summary row (desktop accordion parity).
  const root = getPRCommentGroupRoot(group)
  const count = getPRCommentGroupCount(group)
  const Chevron = expanded ? ChevronDown : ChevronRight
  return (
    <View className={styles.group}>
      <Pressable
        accessibilityRole="button"
        className="active:bg-accent min-h-11 flex-row items-center gap-2 rounded-xl px-3 py-2"
        onPress={() => setExpanded((value) => !value)}
      >
        <Text className="text-muted-foreground min-w-0 flex-1 text-xs" numberOfLines={1}>
          Resolved {group.kind === 'thread' ? 'thread' : 'comment'} by {root.author}
          {count > 1 ? ` (${count})` : ''}
        </Text>
        <View className="w-5 items-center">
          <Chevron size={14} colorClassName="accent-muted-foreground" />
        </View>
      </Pressable>
      {expanded ? <View className={shared.sectionBody}>{cards}</View> : null}
    </View>
  )
}
