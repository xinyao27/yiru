import { useRef, useState } from 'react'
import { ActivityIndicator, TextInput, View } from 'react-native'

import { isSubmittableCommentBody } from '../../session/pr/comment-actions'
import { MobileGlassSurface } from '../glass/surface'
import { MobileGlassTextButton } from '../glass/text-button'

type Props = {
  // Plain-text composer shared by the reply affordance, the root-comment box, and
  // the inline edit editor.
  placeholder: string
  submitLabel: string
  submitting: boolean
  // Seeds the field for the edit case; the reply/add cases leave it empty.
  initialBody?: string
  // Resolves to true on success; the composer clears + collapses (caller-driven via key remount or onSubmitted).
  onSubmit: (body: string) => Promise<boolean>
  onCancel?: () => void
  autoFocus?: boolean
}

export function PRCommentComposer({
  placeholder,
  submitLabel,
  submitting,
  initialBody,
  onSubmit,
  onCancel,
  autoFocus
}: Props) {
  const [body, setBody] = useState(initialBody ?? '')
  // Why: parent `submitting` flips async; a fast double-tap can fire onSubmit
  // twice before it flips, so guard locally in the same synchronous tick.
  const inFlightRef = useRef(false)
  const canSubmit = isSubmittableCommentBody(body) && !submitting

  const submit = async () => {
    if (!canSubmit || inFlightRef.current) {
      return
    }
    inFlightRef.current = true
    try {
      const ok = await onSubmit(body.trim())
      if (ok) {
        setBody('')
      }
    } finally {
      inFlightRef.current = false
    }
  }

  return (
    <View className="gap-3">
      <MobileGlassSurface className="min-h-16 overflow-hidden rounded-xl" isInteractive>
        <TextInput
          className="text-foreground min-h-16 px-3 py-2 text-sm"
          style={{ textAlignVertical: 'top' }}
          value={body}
          onChangeText={setBody}
          placeholder={placeholder}
          placeholderTextColorClassName="accent-muted-foreground"
          multiline
          editable={!submitting}
          autoFocus={autoFocus}
        />
      </MobileGlassSurface>
      <View className="flex-row justify-end gap-2">
        {onCancel ? (
          <MobileGlassTextButton
            accessibilityLabel="Cancel"
            disabled={submitting}
            label="Cancel"
            onPress={onCancel}
            size="regular"
          />
        ) : null}
        {submitting ? (
          <ActivityIndicator size="small" colorClassName="accent-muted-foreground" />
        ) : (
          <MobileGlassTextButton
            accessibilityLabel={submitLabel}
            disabled={!canSubmit}
            isProminent
            label={submitLabel}
            onPress={() => void submit()}
            size="regular"
          />
        )}
      </View>
    </View>
  )
}
