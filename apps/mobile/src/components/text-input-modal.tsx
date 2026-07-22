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
      <View className={styles.header}>
        <Text className={styles.title}>{title}</Text>
        {message ? <Text className={styles.message}>{message}</Text> : null}
      </View>

      <TextInput
        className={styles.input}
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

      <View className={styles.actions}>
        <Pressable
          className={cn(styles.cancelButton, styles.buttonPressedActive)}
          onPress={onCancel}
        >
          <Text className={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          className={cn(
            styles.submitButton,
            styles.buttonPressedActive,
            !canSubmit && styles.submitButtonDisabled
          )}
          disabled={!canSubmit}
          onPress={handleSubmit}
        >
          <Text className={styles.submitText}>{submitLabel}</Text>
        </Pressable>
      </View>
    </BottomDrawer>
  )
}

const styles = {
  header: cn('px-1 pb-2'),
  title: cn('text-[15px] font-semibold text-foreground'),
  message: cn('text-[13px] text-muted-foreground/60 mt-[2px]'),
  // Why: matches NewWorktreeModal's input — bgRaised on the modal
  // background reads as a tappable surface (brighter than the wrapper)
  // rather than a recessed pit (darker than the wrapper, which is what
  // bgBase looked like inside a bgPanel group).
  input: cn(
    'bg-secondary text-foreground rounded-none px-3 py-2 ios:py-2.5 text-[14px] border border-border'
  ),
  actions: cn('flex-row justify-end gap-2 mt-3'),
  cancelButton: cn('px-4 py-2 rounded-none'),
  submitButton: cn('bg-foreground px-4 py-2 rounded-none'),
  buttonPressedActive: cn('active:opacity-[0.7]'),
  submitButtonDisabled: cn('opacity-[0.4]'),
  cancelText: cn('text-muted-foreground text-[14px] font-medium'),
  submitText: cn('text-background text-[14px] font-semibold')
} as const
