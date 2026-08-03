import type { DiffComment } from '@yiru/workbench-model/workspace'
import { cn } from 'cnfast'
import { Pressable, Text, TextInput, View } from 'react-native'

import { MobileContentSection } from '~/components/content-section'
import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { MobileGlassSurface } from '~/components/glass/surface'
import { MobileGlassTextButton } from '~/components/glass/text-button'
import { MobileSyntaxSegments } from '~/components/syntax-segments'
import { Chat as MessageSquare, Plus } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import { sessionScreenClassNames as styles } from './screen-class-names'
import type { RenderableDiffLine } from './screen-state'

export function DiffLineRow({
  line,
  title,
  index,
  comments,
  activeCommentLine,
  commentDraft,
  commentsBusy,
  onStartComment,
  onCancelComment,
  onDraftChange,
  onSubmitComment,
  onDeleteComment
}: {
  line: RenderableDiffLine
  title: string
  index: number
  comments: DiffComment[]
  activeCommentLine: number | null
  commentDraft: string
  commentsBusy: boolean
  onStartComment: (lineNumber: number) => void
  onCancelComment: () => void
  onDraftChange: (value: string) => void
  onSubmitComment: (lineNumber: number) => void
  onDeleteComment: (commentId: string) => void
}) {
  const commentLine = line.newLineNumber
  const isCommenting = commentLine !== undefined && activeCommentLine === commentLine
  const canComment = commentLine !== undefined
  // Why: review notes are anchored to the modified side, so the single mobile
  // gutter should show the same line number the note will reference.
  const gutterLineNumber = line.newLineNumber ?? line.oldLineNumber ?? ''
  return (
    <View className="mb-1">
      <View
        className={cn(
          'flex-row items-start border-l-2 border-editor-surface pr-2',
          line.kind === 'add' && 'bg-diff-inserted border-git-added',
          line.kind === 'delete' && 'bg-diff-removed border-git-deleted'
        )}
      >
        <Text className="text-muted-foreground w-11 pr-2 text-right font-mono text-xs leading-6">
          {gutterLineNumber}
        </Text>
        <Text
          selectable
          className="text-foreground flex-1 font-mono text-sm leading-6"
          accessibilityLabel={translate(
            'mobile.session.diff.line.accessibility',
            '{{title}} diff line {{number}}',
            { title, number: index + 1 }
          )}
        >
          <Text
            className={cn(
              'text-muted-foreground',
              line.kind === 'add' && 'text-git-added',
              line.kind === 'delete' && 'text-git-deleted'
            )}
          >
            {line.kind === 'add' ? '+ ' : line.kind === 'delete' ? '- ' : '  '}
          </Text>
          <MobileSyntaxSegments segments={line.segments} />
        </Text>
        {canComment ? (
          <Pressable
            className={cn(
              'h-11 w-11 items-center justify-center',
              'active:bg-accent',
              commentsBusy && styles.diffCommentButtonDisabled
            )}
            disabled={commentsBusy}
            onPress={() => {
              if (commentLine !== undefined) {
                onStartComment(commentLine)
              }
            }}
            accessibilityLabel={translate(
              'mobile.review.line.addNoteAccessibility',
              'Add note on line {{number}}',
              { number: commentLine }
            )}
          >
            <Plus size={12} colorClassName="accent-muted-foreground" />
          </Pressable>
        ) : null}
      </View>
      {comments.length > 0 ? (
        <View className="mt-1 mr-2 ml-11 gap-1">
          {comments.map((comment) => (
            <MobileContentSection key={comment.id} className="rounded-xl px-2 py-1">
              <View className="mb-1 flex-row items-center gap-1">
                <MessageSquare size={12} colorClassName="accent-muted-foreground" />
                <Text className="text-muted-foreground flex-1 text-xs font-semibold">
                  {translate('mobile.session.diff.note.line', 'Line {{number}}', {
                    number: comment.lineNumber
                  })}
                </Text>
                <MobileGlassIconButton
                  accessibilityLabel={translate(
                    'mobile.session.diff.note.deleteAccessibility',
                    'Delete note on line {{number}}',
                    { number: comment.lineNumber }
                  )}
                  disabled={commentsBusy}
                  icon="close"
                  onPress={() => onDeleteComment(comment.id)}
                  size="small"
                />
              </View>
              <Text className="text-foreground text-xs leading-5">{comment.body}</Text>
            </MobileContentSection>
          ))}
        </View>
      ) : null}
      {isCommenting ? (
        <MobileGlassSurface className="mt-1 mr-2 ml-11 gap-2 rounded-xl p-2" isFunctional>
          <TextInput
            className="text-foreground mr-0 h-20 min-h-20 flex-1 px-3 py-2 font-mono text-sm"
            value={commentDraft}
            onChangeText={onDraftChange}
            placeholder={translate('mobile.review.notePlaceholder', 'Review note')}
            placeholderTextColorClassName="accent-muted-foreground"
            editable={!commentsBusy}
            multiline
            textAlignVertical="top"
            autoFocus
          />
          <MobileGlassGroup className="flex-row justify-end gap-2" spacing={8}>
            <MobileGlassTextButton
              disabled={commentsBusy}
              label={translate('mobile.common.cancel', 'Cancel')}
              onPress={onCancelComment}
              size="small"
            />
            <MobileGlassTextButton
              disabled={!commentDraft.trim() || commentsBusy}
              isProminent
              label={translate('mobile.session.diff.note.save', 'Save note')}
              onPress={() => {
                if (commentLine !== undefined) {
                  onSubmitComment(commentLine)
                }
              }}
              size="small"
            />
          </MobileGlassGroup>
        </MobileGlassSurface>
      ) : null}
    </View>
  )
}
