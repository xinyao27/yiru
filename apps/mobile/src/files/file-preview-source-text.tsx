import { useEffect, useMemo, useRef } from 'react'
import { ScrollView, Text } from 'react-native'

import { MobileSyntaxSegments } from '../components/syntax-segments'
import { scrollOffsetForPreviewLine } from './file-preview-line-column'
import { formatPreviewByteLength } from './file-preview-request'
import { filePreviewStyles as styles } from './file-preview-styles'
import { buildMobileFilePreviewSyntax } from './file-preview-syntax'

export function MobileFilePreviewSourceText({
  relativePath,
  content,
  truncated,
  byteLength,
  initialLine
}: {
  relativePath: string
  content: string
  truncated?: boolean
  byteLength?: number
  initialLine?: number
}) {
  const scrollRef = useRef<ScrollView>(null)
  const revealedRef = useRef(false)
  const syntax = useMemo(
    () => buildMobileFilePreviewSyntax(relativePath, content),
    [content, relativePath]
  )

  useEffect(() => {
    revealedRef.current = false
  }, [content, initialLine, relativePath])

  const revealInitialLine = () => {
    if (!initialLine || revealedRef.current) {
      return
    }
    revealedRef.current = true
    scrollRef.current?.scrollTo({
      y: scrollOffsetForPreviewLine(initialLine),
      animated: false
    })
  }

  return (
    <ScrollView
      ref={scrollRef}
      className={styles.scroll}
      contentContainerClassName="p-3 pb-6"
      onContentSizeChange={revealInitialLine}
    >
      {truncated ? (
        <MobileFilePreviewTruncatedNote byteLength={byteLength ?? content.length} />
      ) : null}
      <Text
        selectable
        className="text-foreground font-mono text-xs leading-5"
        accessibilityLabel="File preview"
      >
        <MobileSyntaxSegments segments={syntax.segments} />
      </Text>
    </ScrollView>
  )
}

export function MobileFilePreviewTruncatedNote({ byteLength }: { byteLength: number }) {
  return (
    <Text className="text-muted-foreground mb-3 text-xs">
      Preview truncated. File size: {formatPreviewByteLength(byteLength)}.
    </Text>
  )
}
