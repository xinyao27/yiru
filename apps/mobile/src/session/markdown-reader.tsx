import { cn } from 'cnfast'
import { useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { useCSSVariable } from 'uniwind'

import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassSurface } from '~/components/glass/surface'
import { MobileGlassTextButton } from '~/components/glass/text-button'
import { MobileRichMarkdownEditor } from '~/components/rich-markdown-editor'
import { resolveCssNumber } from '~/style/resolve-css-variable'

import { resolveMarkdownFloatingActionsBottom } from './markdown-floating-actions-layout'
import { sessionScreenClassNames as styles } from './screen-class-names'
import type { MarkdownDocState } from './screen-state'

export function MarkdownReader({
  documentId,
  doc,
  onRefresh,
  onChange,
  onSave,
  onCopy,
  onDiscard,
  keyboardLift
}: {
  documentId: string
  doc: MarkdownDocState | undefined
  onRefresh: () => void
  onChange: (content: string) => void
  onSave: () => void
  onCopy: () => void
  onDiscard: () => void
  keyboardLift: number
}) {
  const [spacing3Value, spacing4Value] = useCSSVariable(['--spacing-3', '--spacing-4'])
  const spacing3 = resolveCssNumber(spacing3Value)
  const spacing4 = resolveCssNumber(spacing4Value)
  // The editor lives in a WebView; native Keyboard events under-report its
  // covered area, so prefer the inset measured inside the WebView when larger.
  const [webviewKeyboardInset, setWebviewKeyboardInset] = useState(0)
  const effectiveKeyboardLift = Math.max(keyboardLift, webviewKeyboardInset)
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
        <MobileGlassTextButton label="Retry" onPress={onRefresh} size="small" />
      </View>
    )
  }

  const statusText = doc.saveError
    ? doc.saveError
    : doc.readOnlyReason
      ? 'Read only'
      : doc.stale
        ? 'Changed on desktop'
        : null
  const showRefresh = (doc.stale && !doc.isDirty) || !doc.editable
  const showCopy = doc.saveError || !doc.editable
  const showSave = doc.isDirty || doc.saving
  const showFloatingActions = statusText || showRefresh || showCopy || showSave

  return (
    <View className={styles.markdownEditor}>
      <MobileRichMarkdownEditor
        key={documentId}
        content={doc.localContent}
        editable={doc.editable && !doc.saving}
        onChange={onChange}
        onKeyboardInsetChange={setWebviewKeyboardInset}
      />
      {showFloatingActions ? (
        <View
          pointerEvents="box-none"
          className="absolute right-3 bottom-4 left-3 items-end gap-1"
          style={[
            {
              bottom: resolveMarkdownFloatingActionsBottom({
                keyboardLift: effectiveKeyboardLift,
                restingBottom: spacing4,
                liftedClearance: spacing3
              })
            }
          ]}
        >
          {statusText ? (
            <MobileGlassSurface
              className="max-w-full self-end overflow-hidden rounded-xl px-2 py-1"
              isFunctional
            >
              <Text
                className={cn(
                  'text-muted-foreground text-xs',
                  doc.saveError ? styles.markdownError : null
                )}
                numberOfLines={2}
              >
                {statusText}
              </Text>
            </MobileGlassSurface>
          ) : null}
          <MobileGlassGroup className="flex-row flex-wrap justify-end gap-2" spacing={8}>
            {showCopy ? <MobileGlassTextButton label="Copy" onPress={onCopy} size="small" /> : null}
            {showRefresh ? (
              <MobileGlassTextButton label="Refresh" onPress={onRefresh} size="small" />
            ) : null}
            {doc.isDirty ? (
              <MobileGlassTextButton
                isDestructive
                label="Discard"
                onPress={onDiscard}
                size="small"
              />
            ) : null}
            {showSave ? (
              doc.saving ? (
                <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
              ) : (
                <MobileGlassTextButton
                  disabled={!doc.editable || !doc.isDirty}
                  isProminent
                  label="Save"
                  onPress={onSave}
                  size="small"
                />
              )
            ) : null}
          </MobileGlassGroup>
        </View>
      ) : null}
    </View>
  )
}
