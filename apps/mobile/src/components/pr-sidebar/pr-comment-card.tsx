import type { GitHubReaction, GitHubReactionContent, PRComment } from '@yiru/workbench-model/review'
import { memo, useState } from 'react'
import { Image, Linking, Text, View } from 'react-native'

import { isResolvableComment } from '~/session/pr/comment-actions'
import { cn } from '~/style/class-names'

import { MobileContentSection } from '../content-section'
import { MobileGlassGroup } from '../glass/group'
import { MobileGlassIconButton } from '../glass/icon-button'
import { MobileGlassTextButton } from '../glass/text-button'
import { CommentMarkdown } from './comment-markdown'
import { PRCommentComposer } from './pr-comment-composer'
import { formatPrCommentRelativeTime } from './pr-comment-time'
import { prCommentsStyles as styles } from './pr-comments-styles'

// Action handlers are passed from the comment actions hook (stable callbacks), so
// adding them keeps the memo'd card from re-rendering on unrelated timeline changes.
export type PRCommentCardActions = {
  reply: (comment: PRComment, body: string) => Promise<boolean>
  toggleResolve: (comment: PRComment) => Promise<boolean>
  isReplyBusy: (commentId: number) => boolean
  isResolveBusy: (threadId: string) => boolean
}

const REACTION_EMOJI: Record<GitHubReactionContent, string> = {
  '+1': '👍',
  '-1': '👎',
  laugh: '😄',
  confused: '😕',
  heart: '❤️',
  hooray: '🎉',
  rocket: '🚀',
  eyes: '👀'
}

function Reactions({ reactions }: { reactions?: GitHubReaction[] }) {
  const visible = (reactions ?? []).filter((r) => r.count > 0)
  if (visible.length === 0) {
    return null
  }
  return (
    <View className="mt-1 flex-row flex-wrap gap-1">
      {visible.map((r) => (
        <View
          key={r.content}
          className="border-hairline border-border bg-secondary h-6 flex-row items-center gap-1 rounded-full px-2"
        >
          <Text>{REACTION_EMOJI[r.content]}</Text>
          <Text className="text-foreground text-xs">{r.count}</Text>
        </View>
      ))}
    </View>
  )
}

// One PR comment (or review-thread reply), mirroring the desktop comment card:
// avatar + author + relative time + inline file:line + resolved chip + open-on-
// GitHub, then the markdown body and reactions. When `actions` is provided the
// card grows a Reply composer and (for review threads) a Resolve/Unresolve toggle.
export const PRCommentCard = memo(function PRCommentCard({
  comment,
  isReply = false,
  actions
}: {
  comment: PRComment
  isReply?: boolean
  actions?: PRCommentCardActions
}) {
  const [replyOpen, setReplyOpen] = useState(false)
  const fileLabel = comment.path
    ? `${comment.path.split('/').pop()}${comment.line ? `:L${comment.line}` : ''}`
    : null
  const canResolve = actions ? isResolvableComment(comment) : false
  const resolveBusy =
    canResolve && actions ? actions.isResolveBusy(comment.threadId as string) : false
  const replyBusy = actions ? actions.isReplyBusy(comment.id) : false
  const submitReply = async (body: string): Promise<boolean> => {
    if (!actions) {
      return false
    }
    const ok = await actions.reply(comment, body)
    if (ok) {
      setReplyOpen(false)
    }
    return ok
  }

  return (
    <MobileContentSection className={cn(isReply && 'ml-4', comment.isResolved && 'opacity-60')}>
      <View className="border-b-hairline border-b-border flex-row items-center gap-2 px-3 py-2">
        {comment.authorAvatarUrl ? (
          <Image source={{ uri: comment.authorAvatarUrl }} className={styles.avatar} />
        ) : (
          <View className={styles.avatar} />
        )}
        <Text
          className={cn(
            'text-foreground text-xs font-semibold shrink',
            comment.isResolved && 'text-muted-foreground'
          )}
          numberOfLines={1}
        >
          {comment.author}
        </Text>
        <Text className="text-muted-foreground text-xs">
          · {formatPrCommentRelativeTime(comment.createdAt, Date.now())}
        </Text>
        {fileLabel ? (
          <Text className="text-muted-foreground shrink font-mono text-xs" numberOfLines={1}>
            {fileLabel}
          </Text>
        ) : null}
        {comment.isResolved ? (
          <View className="border-hairline border-border bg-secondary rounded-full px-2 py-1">
            <Text className="text-muted-foreground text-xs">resolved</Text>
          </View>
        ) : null}
        {comment.url ? (
          <MobileGlassIconButton
            accessibilityLabel="Open comment on GitHub"
            icon="external"
            onPress={() => void Linking.openURL(comment.url).catch(() => {})}
            size="small"
          />
        ) : null}
      </View>
      <View className="px-3 py-2">
        <CommentMarkdown content={comment.body} />
        <Reactions reactions={comment.reactions} />
      </View>
      {actions ? (
        <MobileGlassGroup className="flex-row gap-2 px-3 pt-1 pb-2" spacing={8}>
          <MobileGlassTextButton
            accessibilityLabel="Reply to comment"
            disabled={replyBusy}
            label="Reply"
            onPress={() => setReplyOpen((value) => !value)}
            size="small"
          />
          {canResolve ? (
            <MobileGlassTextButton
              accessibilityLabel={comment.isResolved ? 'Unresolve thread' : 'Resolve thread'}
              disabled={resolveBusy}
              label={resolveBusy ? '…' : comment.isResolved ? 'Unresolve' : 'Resolve'}
              onPress={() => void actions.toggleResolve(comment)}
              size="small"
            />
          ) : null}
        </MobileGlassGroup>
      ) : null}
      {replyOpen && actions ? (
        <View className="px-3 pb-3">
          <PRCommentComposer
            placeholder="Write a reply…"
            submitLabel="Reply"
            submitting={replyBusy}
            onSubmit={submitReply}
            onCancel={() => setReplyOpen(false)}
            autoFocus
          />
        </View>
      ) : null}
    </MobileContentSection>
  )
})
