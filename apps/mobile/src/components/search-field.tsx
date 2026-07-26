import { useEffect, useRef, useState } from 'react'
import { InteractionManager, Pressable, TextInput, View, type TextInputProps } from 'react-native'

import { MagnifyingGlass as Search, X } from '@/components/uniwind-icons'
import { cn } from '@/style/class-names'

// Why: toolbar/list chrome paints and settles after the open tap; native
// autoFocus alone often fails to raise the soft keyboard on iOS/Android.
const SEARCH_AUTO_FOCUS_DELAY_MS = 120

type MobileSearchFieldProps = {
  value: string
  onChangeText: (text: string) => void
  placeholder: string
  onClear?: () => void
  /** Override clear-button visibility (default: value is non-empty). */
  showClear?: boolean
  clearAccessibilityLabel?: string
  autoFocus?: boolean
  /** Re-run delayed focus when this identity changes (e.g. each time search opens). */
  focusKey?: unknown
  returnKeyType?: TextInputProps['returnKeyType']
  onSubmitEditing?: TextInputProps['onSubmitEditing']
  onBlur?: TextInputProps['onBlur']
  editable?: boolean
  accessibilityLabel?: string
}

/**
 * Raised search field used on list screens. Sits above the base/panel canvas
 * so it reads as a tappable control instead of chrome that blends into the list.
 */
export function MobileSearchField({
  value,
  onChangeText,
  placeholder,
  onClear,
  showClear,
  clearAccessibilityLabel = 'Clear search',
  autoFocus = false,
  focusKey,
  returnKeyType = 'search',
  onSubmitEditing,
  onBlur,
  editable = true,
  accessibilityLabel
}: MobileSearchFieldProps) {
  const inputRef = useRef<TextInput>(null)
  const [focused, setFocused] = useState(false)
  const clearVisible = showClear ?? value.length > 0

  useEffect(() => {
    if (!autoFocus || !editable) {
      return
    }

    let timeout: ReturnType<typeof setTimeout> | undefined
    // Why: wait for the open-press interaction + layout to finish, then focus
    // so the soft keyboard actually appears (not just a caret with no IME).
    const task = InteractionManager.runAfterInteractions(() => {
      timeout = setTimeout(() => {
        inputRef.current?.focus()
      }, SEARCH_AUTO_FOCUS_DELAY_MS)
    })

    return () => {
      task.cancel()
      if (timeout) {
        clearTimeout(timeout)
      }
    }
  }, [autoFocus, editable, focusKey])

  function handleClear() {
    if (onClear) {
      onClear()
    } else {
      onChangeText('')
    }
    // Why: pressing the clear chip steals focus and drops the keyboard;
    // re-focus so the user can keep typing without tapping the field again.
    requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
  }

  return (
    <View
      className={cn(
        styles.shell,
        focused && styles.shellFocused,
        !editable && styles.shellDisabled
      )}
    >
      <Search
        size={15}
        colorClassName={focused ? 'accent-foreground' : 'accent-muted-foreground'}
      />
      <TextInput
        ref={inputRef}
        className={styles.input}
        style={{ includeFontPadding: false, textAlignVertical: 'center' }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        // Why: textSecondary keeps the hint readable on bgRaised; textMuted
        // disappears against the raised shell and makes the field look empty.
        placeholderTextColorClassName="accent-muted-foreground"
        autoCapitalize="none"
        autoCorrect={false}
        // Still request native auto-focus; the delayed ref focus is the reliable path.
        autoFocus={autoFocus}
        showSoftInputOnFocus
        editable={editable}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          setFocused(false)
          onBlur?.(event)
        }}
        clearButtonMode="never"
        accessibilityLabel={accessibilityLabel ?? placeholder}
        selectionColorClassName="accent-primary"
      />
      {clearVisible ? (
        <Pressable
          onPress={handleClear}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={clearAccessibilityLabel}
          className={cn(styles.clearButton, styles.clearButtonPressedActive)}
        >
          {/* Why: chip + larger hit target — a bare 14px X was hard to tap and
              read as decoration rather than a clear control. */}
          <View className={styles.clearChip}>
            <X size={12} colorClassName="accent-background" />
          </View>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = {
  // Why: bgRaised lifts the field off bgBase/bgPanel so search is an obvious
  // control, matching TextInputModal / MobilePrBasePicker input shells.
  shell: cn(
    'min-h-[42px] flex-row items-center gap-2 bg-secondary border border-border rounded-none pl-3 pr-1 py-1.5 ios:py-2'
  ),
  // Why: monochrome focus cue without burning the blue accent token
  // (reserved for state/selection). textMuted reads clearly on bgRaised.
  shellFocused: cn('border-muted-foreground/60'),
  shellDisabled: cn('opacity-[0.55]'),
  // Why: Android TextInput draws extra vertical padding that misaligns the
  // icon/clear chip unless we zero it out.
  input: cn('flex-1 min-w-0 p-0 m-0 text-foreground text-[14px]'),
  clearButton: cn('min-w-9 min-h-9 items-center justify-center'),
  clearButtonPressedActive: cn('active:opacity-[0.7]'),
  // Why: textMuted reads as a solid chip on bgRaised; borderSubtle was nearly
  // invisible and made the clear control feel like decorative chrome.
  clearChip: cn('w-6 h-6 rounded-none items-center justify-center bg-muted-foreground/60')
} as const
