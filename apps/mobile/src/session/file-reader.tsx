import type { DiffComment } from '@yiru/workbench-model/workspace'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  ScrollView,
  Text,
  View,
  type ListRenderItem
} from 'react-native'

import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassSurface } from '~/components/glass/surface'
import { MobileGlassTextButton } from '~/components/glass/text-button'
import { MobileHtmlPreview } from '~/components/html-preview'
import { MobileSyntaxSegments } from '~/components/syntax-segments'
import { Chat as MessageSquare } from '~/components/uniwind-icons'

import { DiffLineRow } from './diff-line-row'
import {
  buildPlainMobileDiffSyntaxLines,
  highlightMobileCode,
  highlightMobileDiffLines,
  resolveMobileSyntaxLanguage
} from './file-syntax'
import { sessionScreenClassNames as styles } from './screen-class-names'
import type {
  DiffCommentActions,
  DiffSyntaxState,
  FileDocState,
  FileSyntaxState,
  RenderableDiffLine
} from './screen-state'

export function FileReader({
  doc,
  title,
  relativePath,
  language,
  diffCommentActions
}: {
  doc: FileDocState | undefined
  title: string
  relativePath: string
  language?: string
  diffCommentActions?: DiffCommentActions
}) {
  const syntaxLanguage = useMemo(
    () => resolveMobileSyntaxLanguage(relativePath || title, language),
    [language, relativePath, title]
  )
  const [fileSyntax, setFileSyntax] = useState<FileSyntaxState | null>(null)
  const [diffSyntax, setDiffSyntax] = useState<DiffSyntaxState | null>(null)
  const [activeCommentLine, setActiveCommentLine] = useState<number | null>(null)
  const [commentDraft, setCommentDraft] = useState('')
  const plainDiffLines = useMemo(
    () =>
      doc?.status === 'ready' && doc.kind === 'diff'
        ? buildPlainMobileDiffSyntaxLines(doc.lines)
        : [],
    [doc]
  )
  const diffCommentsForFile = useMemo(
    () =>
      diffCommentActions?.comments.filter(
        (comment) => comment.filePath === relativePath && comment.source !== 'markdown'
      ) ?? [],
    [diffCommentActions?.comments, relativePath]
  )
  const diffCommentsByLine = useMemo(() => {
    const map = new Map<number, DiffComment[]>()
    for (const comment of diffCommentsForFile) {
      const list = map.get(comment.lineNumber) ?? []
      list.push(comment)
      map.set(comment.lineNumber, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.createdAt - b.createdAt)
    }
    return map
  }, [diffCommentsForFile])

  const startComment = useCallback((lineNumber: number) => {
    setActiveCommentLine(lineNumber)
    setCommentDraft('')
  }, [])

  const cancelComment = useCallback(() => {
    setActiveCommentLine(null)
    setCommentDraft('')
  }, [])

  const submitComment = useCallback(
    (lineNumber: number) => {
      if (!diffCommentActions) {
        return
      }
      void diffCommentActions.onAdd(relativePath, lineNumber, commentDraft).then((added) => {
        if (added) {
          setActiveCommentLine(null)
          setCommentDraft('')
        }
      })
    },
    [commentDraft, diffCommentActions, relativePath]
  )

  const renderDiffLine: ListRenderItem<RenderableDiffLine> = useCallback(
    ({ item, index }) => (
      <DiffLineRow
        line={item}
        title={title}
        index={index}
        comments={
          item.newLineNumber !== undefined ? (diffCommentsByLine.get(item.newLineNumber) ?? []) : []
        }
        activeCommentLine={activeCommentLine}
        commentDraft={commentDraft}
        commentsBusy={diffCommentActions?.busy === true}
        onStartComment={startComment}
        onCancelComment={cancelComment}
        onDraftChange={setCommentDraft}
        onSubmitComment={submitComment}
        onDeleteComment={(commentId) => {
          if (diffCommentActions) {
            void diffCommentActions.onDelete(commentId)
          }
        }}
      />
    ),
    [
      activeCommentLine,
      cancelComment,
      commentDraft,
      diffCommentActions,
      diffCommentsByLine,
      startComment,
      submitComment,
      title
    ]
  )

  useEffect(() => {
    if (doc?.status !== 'ready') {
      return undefined
    }

    // Why: highlighting can create many nested Text nodes; defer it one tick so
    // large files show immediately as plain text before colors are applied.
    const timer = setTimeout(() => {
      // file + html share the syntax-segment source view (html's "Source" toggle).
      if (doc.kind === 'file' || doc.kind === 'html') {
        setFileSyntax({
          doc,
          language: syntaxLanguage,
          segments: highlightMobileCode(doc.content, syntaxLanguage).segments
        })
        return
      }
      if (doc.kind === 'diff') {
        setDiffSyntax({
          doc,
          language: syntaxLanguage,
          lines: highlightMobileDiffLines(doc.lines, syntaxLanguage)
        })
      }
      // image: no syntax highlighting.
    }, 0)

    return () => clearTimeout(timer)
  }, [doc, syntaxLanguage])

  if (!doc || doc.status === 'loading') {
    return (
      <View className={styles.markdownState}>
        <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
      </View>
    )
  }
  if (doc.status === 'error') {
    return (
      <View className={styles.markdownState}>
        <Text className={styles.markdownError}>{doc.message}</Text>
      </View>
    )
  }

  if (doc.kind === 'diff') {
    const activeDiffSyntax =
      diffSyntax?.doc === doc && diffSyntax.language === syntaxLanguage ? diffSyntax.lines : null
    const commentCount = diffCommentActions?.comments.length ?? 0
    const unsentCommentCount =
      diffCommentActions?.comments.filter((comment) => !comment.sentAt).length ?? 0
    const commentsBusy = diffCommentActions?.busy === true
    const canCopyNotes = commentCount > 0 && !commentsBusy
    const canSendNotes = unsentCommentCount > 0 && !commentsBusy
    return (
      <View className={styles.markdownEditor}>
        {diffCommentActions ? (
          <MobileGlassSurface
            className="flex-row items-center justify-between gap-2 px-4 py-2"
            isInteractive
          >
            <View className="min-w-0 flex-1 flex-row items-center gap-1">
              <MessageSquare size={14} colorClassName="accent-muted-foreground" />
              <Text className="text-muted-foreground text-xs font-semibold">
                {commentCount === 0
                  ? 'No review notes'
                  : `${commentCount} review ${commentCount === 1 ? 'note' : 'notes'}`}
              </Text>
            </View>
            <MobileGlassGroup className="flex-row items-center gap-2" spacing={8}>
              <MobileGlassTextButton
                accessibilityLabel="Copy review notes"
                disabled={!canCopyNotes}
                label="Copy"
                onPress={() => void diffCommentActions.onCopyAll()}
                size="small"
              />
              <MobileGlassTextButton
                accessibilityLabel="Send review notes to AI"
                disabled={!canSendNotes}
                isProminent
                label="Send"
                onPress={diffCommentActions.onSendAll}
                size="small"
              />
            </MobileGlassGroup>
          </MobileGlassSurface>
        ) : null}
        <FlatList
          data={activeDiffSyntax ?? plainDiffLines}
          className={styles.filePreviewScroll}
          contentContainerClassName={styles.filePreviewContent}
          keyExtractor={(line, index) =>
            `${index}:${line.kind}:${line.oldLineNumber ?? ''}:${line.newLineNumber ?? ''}`
          }
          renderItem={renderDiffLine}
          initialNumToRender={32}
          maxToRenderPerBatch={48}
          windowSize={7}
          removeClippedSubviews={Platform.OS !== 'web'}
          keyboardShouldPersistTaps="handled"
        />
      </View>
    )
  }

  if (doc.kind === 'image') {
    return (
      <View className="bg-editor-surface min-h-0 flex-1">
        <ScrollView
          className="flex-1"
          contentContainerClassName="grow items-center justify-center p-4"
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
        >
          <Image
            source={{ uri: doc.dataUri }}
            className="h-full min-h-50 w-full"
            resizeMode="contain"
            accessibilityLabel={`${title} image`}
          />
        </ScrollView>
      </View>
    )
  }

  const renderSourceText = (content: string) => (
    <View className={styles.markdownEditor}>
      <ScrollView
        className={styles.filePreviewScroll}
        contentContainerClassName={styles.filePreviewContent}
      >
        <Text
          selectable
          className="text-foreground font-mono text-sm leading-6"
          accessibilityLabel={`${title} preview`}
        >
          <MobileSyntaxSegments
            segments={
              fileSyntax?.doc === doc && fileSyntax.language === syntaxLanguage
                ? fileSyntax.segments
                : [{ text: content, kind: 'plain' }]
            }
          />
        </Text>
      </ScrollView>
    </View>
  )

  if (doc.kind === 'html') {
    return (
      <View className={styles.markdownEditor}>
        <MobileHtmlPreview html={doc.content} renderSource={() => renderSourceText(doc.content)} />
      </View>
    )
  }

  return renderSourceText(doc.content)
}
