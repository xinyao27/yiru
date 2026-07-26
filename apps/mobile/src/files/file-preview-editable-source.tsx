import { useEffect, useState } from 'react'
import { Text, TextInput, View } from 'react-native'

import type { MobileFilePreviewLineColumn } from './file-preview-line-column'
import { textOffsetForLineColumn } from './file-preview-line-column'

type Props = {
  title: string
  draftContent: string
  lineColumn: MobileFilePreviewLineColumn | null
  saveError?: string
  onDraftChange: (content: string) => void
}

export function MobileFilePreviewEditableSource({
  title,
  draftContent,
  lineColumn,
  saveError,
  onDraftChange
}: Props) {
  const selectionTargetKey = lineColumn
    ? `${title}:${lineColumn.line}:${lineColumn.column ?? ''}`
    : ''
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null)
  const [revealedTargetKey, setRevealedTargetKey] = useState('')

  // Why: line/column opens should reveal once, then user cursor movement owns selection.
  useEffect(() => {
    if (!lineColumn || !selectionTargetKey || revealedTargetKey === selectionTargetKey) {
      return
    }
    const offset = textOffsetForLineColumn(draftContent, lineColumn)
    const initialSelection = { start: offset, end: offset }
    setSelection(initialSelection)
    setRevealedTargetKey(selectionTargetKey)
  }, [draftContent, lineColumn, revealedTargetKey, selectionTargetKey])

  return (
    <View className="flex-1 bg-[var(--editor-surface)] p-3">
      {saveError ? <Text className="text-destructive mb-2 text-xs">{saveError}</Text> : null}
      <TextInput
        className="text-foreground flex-1 p-0 font-mono text-[13px] leading-[19px]"
        value={draftContent}
        onChangeText={onDraftChange}
        multiline
        textAlignVertical="top"
        autoCapitalize="none"
        autoCorrect={false}
        selection={selection ?? undefined}
        onSelectionChange={() => setSelection(null)}
        accessibilityLabel={`${title} editor`}
      />
    </View>
  )
}
