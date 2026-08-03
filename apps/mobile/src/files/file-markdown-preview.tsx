import { useState } from 'react'
import { ScrollView, View } from 'react-native'

import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassPressable } from '~/components/glass/pressable'
import { Code, Pencil } from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

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
      <MobileGlassGroup className="mx-3 my-2 flex-row gap-2 self-start" spacing={8}>
        <MobileGlassPressable
          accessibilityRole="button"
          accessibilityState={{ selected: sourceSelected }}
          accessibilityLabel={translate('mobile.files.markdown.viewSource', 'View Markdown source')}
          className="rounded-lg"
          contentClassName="h-8 w-9 items-center justify-center rounded-lg"
          isSelected={sourceSelected}
          onPress={() => setMode('source')}
          size="small"
        >
          <Code
            size={15}
            colorClassName={sourceSelected ? 'accent-foreground' : 'accent-muted-foreground'}
          />
        </MobileGlassPressable>
        <MobileGlassPressable
          accessibilityRole="button"
          accessibilityState={{ selected: previewSelected }}
          accessibilityLabel={translate(
            'mobile.files.markdown.viewPreview',
            'View rendered Markdown preview'
          )}
          className="rounded-lg"
          contentClassName="h-8 w-9 items-center justify-center rounded-lg"
          isSelected={previewSelected}
          onPress={() => setMode('preview')}
          size="small"
        >
          <Pencil
            size={15}
            colorClassName={previewSelected ? 'accent-foreground' : 'accent-muted-foreground'}
          />
        </MobileGlassPressable>
      </MobileGlassGroup>
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
