import type { DiffComment } from '@yiru/workbench-model/workspace'
import { Pressable, Text, View } from 'react-native'

import { Chat as MessageSquare } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { MobileDiffLine } from '../session/diff/lines'
import type { MobileHighlightedDiffLine } from '../session/file-syntax'
import { mobileDiffLineNumber, mobileDiffLinePrefix } from '../source-control/diff-format'
import { MobileSyntaxSegments } from './syntax-segments'

type Props = {
  line: MobileHighlightedDiffLine<MobileDiffLine>
  comments: readonly DiffComment[]
  staleCommentIds: ReadonlySet<string>
  active: boolean
  onAddNote: (lineNumber: number) => void
  onEditNote: (comment: DiffComment) => void
}

function accessibilityLabelForLine(line: MobileDiffLine): string {
  const number = mobileDiffLineNumber(line)
  const label = line.kind === 'add' ? 'Added' : line.kind === 'delete' ? 'Deleted' : 'Context'
  return number ? `${label} line ${number}` : `${label} line`
}

function canCommentOnLine(line: MobileDiffLine): boolean {
  return line.kind !== 'delete' && line.newLineNumber !== undefined
}

export function MobileDiffReviewLine({
  line,
  comments,
  staleCommentIds,
  active,
  onAddNote,
  onEditNote
}: Props) {
  const lineNumber = mobileDiffLineNumber(line)
  const canComment = canCommentOnLine(line)

  return (
    <View
      className={cn(
        'flex-row items-stretch border-b-hairline border-b-border',
        line.kind === 'add' && 'bg-[var(--editor-diff-inserted-line-background)]',
        line.kind === 'delete' && 'bg-[var(--editor-diff-removed-line-background)]',
        active && 'border-l-2 border-l-primary'
      )}
      accessible
      accessibilityLabel={accessibilityLabelForLine(line)}
    >
      <Text className="text-muted-foreground/60 w-[18px] text-center font-mono text-xs leading-[18px]">
        {mobileDiffLinePrefix(line.kind)}
      </Text>
      <Text className="text-muted-foreground/60 w-11 pr-1 text-right font-mono text-xs leading-[18px]">
        {lineNumber ? String(lineNumber) : ''}
      </Text>
      <Pressable
        className={cn('flex-1 min-w-0 px-2', canComment && 'active:bg-accent')}
        disabled={!canComment}
        onPress={() => {
          if (canComment && line.newLineNumber !== undefined) {
            onAddNote(line.newLineNumber)
          }
        }}
        accessibilityRole={canComment ? 'button' : 'text'}
        accessibilityLabel={
          canComment && line.newLineNumber !== undefined
            ? `Add note on line ${line.newLineNumber}`
            : accessibilityLabelForLine(line)
        }
      >
        <Text className="text-foreground font-mono text-xs leading-[18px]">
          <MobileSyntaxSegments segments={line.segments} />
        </Text>
      </Pressable>
      {comments.length > 0 ? (
        <View className="w-10 items-center justify-center gap-[2px]">
          {comments.map((comment) => (
            <Pressable
              key={comment.id}
              className="active:bg-accent min-h-7 min-w-8 items-center justify-center"
              onPress={() => onEditNote(comment)}
              accessibilityRole="button"
              accessibilityLabel={`Edit note on line ${comment.lineNumber}`}
            >
              <MessageSquare
                size={13}
                colorClassName={
                  staleCommentIds.has(comment.id) ? 'accent-amber-500' : 'accent-muted-foreground'
                }
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  )
}
