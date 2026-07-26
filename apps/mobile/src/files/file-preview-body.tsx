import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native'

import { MobileFileMarkdownPreview } from './file-markdown-preview'
import { MobileFilePreviewEditableSource } from './file-preview-editable-source'
import type { MobileFilePreviewLineColumn } from './file-preview-line-column'
import type { MobileFilePreviewResult } from './file-preview-request'
import { MobileFilePreviewSourceText } from './file-preview-source-text'
import { filePreviewStyles as styles } from './file-preview-styles'

type Props = {
  preview: MobileFilePreviewResult
  relativePath: string
  title: string
  editable: boolean
  draftContent: string
  saveError: string
  lineColumn: MobileFilePreviewLineColumn | null
  imageWidth: number
  imageHeight: number
  onDraftChange: (content: string) => void
  onImageError: () => void
  onRetry: () => void
}

export function MobileFilePreviewBody({ preview, ...options }: Props) {
  if (preview.status === 'loading') {
    return (
      <View className={styles.state}>
        <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
        <Text className={styles.stateText}>{preview.message}</Text>
      </View>
    )
  }
  if (preview.status === 'error' || preview.status === 'waiting') {
    return (
      <View className={styles.state}>
        <Text className="text-destructive text-center text-sm">{preview.message}</Text>
        <Pressable
          className="border-hairline border-border min-h-9 items-center justify-center rounded-xl px-4"
          onPress={options.onRetry}
        >
          <Text className="text-foreground text-sm font-semibold">Retry</Text>
        </Pressable>
      </View>
    )
  }
  if (preview.status === 'empty') {
    return options.editable ? (
      <EditablePreviewSource {...options} />
    ) : (
      <View className={styles.state}>
        <Text className={styles.stateText}>Empty file</Text>
      </View>
    )
  }
  if (preview.kind === 'image') {
    return (
      <View className="bg-editor-surface flex-1">
        <ScrollView
          className={styles.scroll}
          contentContainerClassName="grow items-center justify-center p-3"
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
        >
          <Image
            source={{ uri: preview.dataUri }}
            className="bg-editor-surface"
            style={[{ width: options.imageWidth, height: options.imageHeight }]}
            resizeMode="contain"
            onError={options.onImageError}
            accessibilityLabel={`${options.title} image`}
          />
        </ScrollView>
      </View>
    )
  }
  if (preview.kind === 'markdown') {
    return options.editable ? (
      <EditablePreviewSource {...options} />
    ) : (
      <MobileFileMarkdownPreview
        relativePath={options.relativePath}
        content={preview.content}
        truncated={preview.truncated}
        byteLength={preview.byteLength}
        initialLine={options.lineColumn?.line}
      />
    )
  }
  if (preview.kind === 'html') {
    return options.editable ? (
      <EditablePreviewSource {...options} />
    ) : (
      <MobileFilePreviewSourceText
        relativePath={options.relativePath}
        content={preview.content}
        truncated={preview.truncated}
        byteLength={preview.byteLength}
        initialLine={options.lineColumn?.line}
      />
    )
  }
  if (options.editable) {
    return <EditablePreviewSource {...options} />
  }
  return (
    <MobileFilePreviewSourceText
      relativePath={options.relativePath}
      content={preview.content}
      truncated={preview.truncated}
      byteLength={preview.byteLength}
      initialLine={options.lineColumn?.line}
    />
  )
}

function EditablePreviewSource(options: {
  title: string
  draftContent: string
  saveError: string
  lineColumn: MobileFilePreviewLineColumn | null
  onDraftChange: (content: string) => void
}) {
  return (
    <MobileFilePreviewEditableSource
      title={options.title}
      draftContent={options.draftContent}
      saveError={options.saveError}
      lineColumn={options.lineColumn}
      onDraftChange={options.onDraftChange}
    />
  )
}
