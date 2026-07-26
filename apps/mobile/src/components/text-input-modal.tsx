import { useState } from 'react'
import { View, Text, TextInput, Pressable, type KeyboardTypeOptions } from 'react-native'

import { cn } from '@/style/class-names'

import { BottomDrawer } from './bottom-drawer'

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
  submitLabel = 'Save',
  selectTextOnFocus = false,
  allowEmpty = false,
  keyboardType,
  onSubmit,
  onCancel
}: Props) {
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
    <BottomDrawer visible={visible} onClose={onCancel}>
      <View className="px-1 pb-2">
        <Text className="text-foreground text-sm font-semibold">{title}</Text>
        {message ? (
          <Text className="text-muted-foreground/60 mt-[2px] text-xs">{message}</Text>
        ) : null}
      </View>

      {/* Why: the raised fill reads as an input surface instead of a recessed panel. */}
      <TextInput
        className="bg-secondary text-foreground ios:py-2.5 border-border border px-3 py-2 text-sm"
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

      <View className="mt-3 flex-row justify-end gap-2">
        <Pressable className={cn('px-4 py-2', styles.buttonPressedActive)} onPress={onCancel}>
          <Text className="text-muted-foreground text-sm font-medium">Cancel</Text>
        </Pressable>
        <Pressable
          className={cn(
            'bg-primary px-4 py-2',
            styles.buttonPressedActive,
            !canSubmit && 'opacity-[0.4]'
          )}
          disabled={!canSubmit}
          onPress={handleSubmit}
        >
          <Text className="text-primary-foreground text-sm font-semibold">{submitLabel}</Text>
        </Pressable>
      </View>
    </BottomDrawer>
  )
}

const styles = {
  buttonPressedActive: cn('active:bg-accent')
} as const
