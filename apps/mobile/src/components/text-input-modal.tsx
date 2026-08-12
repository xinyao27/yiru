import { useState } from 'react'
import { Text, TextInput, type KeyboardTypeOptions } from 'react-native'

import { translate } from '~/i18n/translate'

import { BottomDrawer } from './bottom-drawer'
import { MobileGlassGroup } from './glass/group'
import { MobileGlassSurface } from './glass/surface'
import { MobileGlassTextButton } from './glass/text-button'

type Props = {
  visible: boolean
  title: string
  message?: string
  defaultValue?: string
  placeholder?: string
  submitLabel?: string
  selectTextOnFocus?: boolean
  allowEmpty?: boolean
  keyboardType?: KeyboardTypeOptions
  onSubmit: (value: string) => void
  onCancel: () => void
}

export function TextInputModal({
  visible,
  title,
  message,
  defaultValue = '',
  placeholder,
  submitLabel = translate('mobile.common.save', 'Save'),
  selectTextOnFocus = false,
  allowEmpty = false,
  keyboardType,
  onSubmit,
  onCancel
}: Props): React.JSX.Element {
  const [value, setValue] = useState(defaultValue)
  const [previousVisible, setPreviousVisible] = useState(visible)
  const [previousDefaultValue, setPreviousDefaultValue] = useState(defaultValue)

  // Why: reset before the opening commit so the drawer never paints the
  // previous modal value while preserving the existing close animation state.
  const shouldResetValue = visible && (!previousVisible || defaultValue !== previousDefaultValue)
  if (visible !== previousVisible || shouldResetValue) {
    setPreviousVisible(visible)
    if (shouldResetValue) {
      setPreviousDefaultValue(defaultValue)
      setValue(defaultValue)
    }
  }

  function handleSubmit() {
    const trimmed = value.trim()
    if (trimmed || allowEmpty) {
      onSubmit(trimmed)
    }
  }

  const canSubmit = allowEmpty || value.trim().length > 0

  return (
    <BottomDrawer visible={visible} onClose={onCancel} title={title}>
      {message ? <Text className="text-muted-foreground pb-2 text-xs">{message}</Text> : null}

      <MobileGlassSurface className="min-h-11 overflow-hidden rounded-full" isInteractive>
        <TextInput
          accessibilityLabel={title}
          className="text-foreground min-h-11 rounded-full px-4 text-sm"
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColorClassName="accent-muted-foreground"
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          selectTextOnFocus={selectTextOnFocus}
          keyboardType={keyboardType}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
          selectionColorClassName="accent-primary"
        />
      </MobileGlassSurface>

      <MobileGlassGroup className="mt-3 flex-row justify-end gap-2" spacing={8}>
        <MobileGlassTextButton
          label={translate('mobile.common.cancel', 'Cancel')}
          onPress={onCancel}
        />
        <MobileGlassTextButton
          disabled={!canSubmit}
          isProminent
          label={submitLabel}
          onPress={handleSubmit}
        />
      </MobileGlassGroup>
    </BottomDrawer>
  )
}
