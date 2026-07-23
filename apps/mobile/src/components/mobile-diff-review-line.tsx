import type { DiffComment } from '@yiru/workbench-model/workspace'
import { Pressable, Text, View } from 'react-native'

import { Chat as MessageSquare } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

import type { MobileDiffLine } from '../session/mobile-diff-lines'
import type { MobileHighlightedDiffLine } from '../session/mobile-file-syntax'
import { mobileDiffLineNumber, mobileDiffLinePrefix } from '../source-control/mobile-diff-format'
import { MobileSyntaxSegments } from './mobile-syntax-segments'

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
        styles.row,
        line.kind === 'add' && styles.addedRow,
        line.kind === 'delete' && styles.deletedRow,
        active && styles.activeRow
      )}
      accessible
      accessibilityLabel={accessibilityLabelForLine(line)}
    >
      <Text className={styles.prefix}>{mobileDiffLinePrefix(line.kind)}</Text>
      <Text className={styles.lineNumber}>{lineNumber ? String(lineNumber) : ''}</Text>
      <Pressable
        className={cn(styles.code, canComment && styles.codePressedActive)}
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
        <Text className={styles.codeText}>
          <MobileSyntaxSegments segments={line.segments} />
        </Text>
      </Pressable>
      {comments.length > 0 ? (
        <View className={styles.notes}>
          {comments.map((comment) => (
            <Pressable
              key={comment.id}
              className={cn(styles.noteButton, styles.noteButtonPressedActive)}
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

// Row height comes from the 18px code lineHeight alone (no vertical padding or
// minHeight) so mobile diff density matches the desktop diff editor (STA-1239).
const styles = {
  row: cn('flex-row items-stretch border-b-hairline border-b-border'),
  addedRow: cn('bg-[var(--editor-diff-inserted-line-background)]'),
  deletedRow: cn('bg-[var(--editor-diff-removed-line-background)]'),
  activeRow: cn('border-l-2 border-l-primary'),
  prefix: cn('w-[18px] text-center text-muted-foreground/60 font-mono text-[12px] leading-[18px]'),
  lineNumber: cn(
    'w-11 pr-1 text-right text-muted-foreground/60 font-mono text-[12px] leading-[18px]'
  ),
  code: cn('flex-1 min-w-0 px-2'),
  codePressedActive: cn('active:bg-secondary'),
  codeText: cn('text-foreground font-mono text-[12px] leading-[18px]'),
  notes: cn('w-10 items-center justify-center gap-[2px]'),
  noteButton: cn('min-w-8 min-h-7 items-center justify-center'),
  noteButtonPressedActive: cn('active:opacity-[0.72]')
} as const
