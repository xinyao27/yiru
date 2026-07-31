import { useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'

import { MobileGlassSurface } from '~/components/glass/surface'
import { Code, Pencil } from '~/components/uniwind-icons'
import { cn } from '~/style/class-names'

import { MobileMarkdown } from '../components/markdown'
import {
  MobileFilePreviewSourceText,
  MobileFilePreviewTruncatedNote
} from './file-preview-source-text'
import { filePreviewStyles as styles } from './file-preview-styles'

type Props = {
  relativePath: string
  content: string
  truncated: boolean
  byteLength: number
  initialLine?: number
}

export function MobileFileMarkdownPreview({
  relativePath,
  content,
  truncated,
  byteLength,
  initialLine
}: Props) {
  const [mode, setMode] = useState<'preview' | 'source'>(() => (initialLine ? 'source' : 'preview'))
  const [previousRelativePath, setPreviousRelativePath] = useState(relativePath)
  const [previousInitialLine, setPreviousInitialLine] = useState(initialLine)
  // Why: opening a different file or line target must switch modes before paint,
  // never briefly retain the prior file's manually selected mode.
  if (relativePath !== previousRelativePath || initialLine !== previousInitialLine) {
    setPreviousRelativePath(relativePath)
    setPreviousInitialLine(initialLine)
    setMode(initialLine ? 'source' : 'preview')
  }
  const previewSelected = mode === 'preview'
  const sourceSelected = mode === 'source'

  return (
    <View className="bg-editor-surface flex-1">
      <MobileGlassSurface
        className="mx-3 my-2 flex-row self-start overflow-hidden rounded-xl p-1"
        isInteractive
      >
        <Pressable
          className={cn(styles.modeToggle, sourceSelected && styles.modeToggleActive)}
          onPress={() => setMode('source')}
          accessibilityRole="button"
          accessibilityState={{ selected: sourceSelected }}
          accessibilityLabel="View Markdown source"
        >
          <Code
            size={15}
            colorClassName={sourceSelected ? 'accent-foreground' : 'accent-muted-foreground'}
          />
        </Pressable>
        <Pressable
          className={cn(styles.modeToggle, previewSelected && styles.modeToggleActive)}
          onPress={() => setMode('preview')}
          accessibilityRole="button"
          accessibilityState={{ selected: previewSelected }}
          accessibilityLabel="View rendered Markdown preview"
        >
          <Pencil
            size={15}
            colorClassName={previewSelected ? 'accent-foreground' : 'accent-muted-foreground'}
          />
        </Pressable>
      </MobileGlassSurface>
      {mode === 'preview' ? (
        <ScrollView className={styles.scroll} contentContainerClassName="p-3 pb-6">
          {truncated ? <MobileFilePreviewTruncatedNote byteLength={byteLength} /> : null}
          <MobileMarkdown content={content} />
        </ScrollView>
      ) : (
        <MobileFilePreviewSourceText
          relativePath={relativePath}
          content={content}
          truncated={truncated}
          byteLength={byteLength}
          initialLine={initialLine}
        />
      )}
    </View>
  )
}
