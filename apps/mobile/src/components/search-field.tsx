import { useEffect, useRef, useState } from 'react'
import { InteractionManager, Pressable, TextInput, View, type TextInputProps } from 'react-native'

import { MobileGlassSurface } from '~/components/glass/surface'
import { MagnifyingGlass as Search, X } from '~/components/uniwind-icons'

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
    // Why: the raised fill makes search read as a control against base and panel surfaces.
    <MobileGlassSurface
      className="ios:py-2 min-h-11 flex-row items-center gap-2 overflow-hidden rounded-full py-2 pr-1 pl-3"
      isFunctional
      isInteractive={editable}
    >
      <Search
        size={15}
        colorClassName={focused ? 'accent-foreground' : 'accent-muted-foreground'}
      />
      <TextInput
        ref={inputRef}
        // Why: zero padding keeps Android text aligned with the icon and clear chip.
        className="text-foreground m-0 min-w-0 flex-1 p-0 text-sm"
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
          className="active:bg-accent min-h-9 min-w-9 items-center justify-center rounded-full"
        >
          {/* Why: chip + larger hit target — a bare 14px X was hard to tap and
              read as decoration rather than a clear control. */}
          <View className="bg-muted-foreground h-6 w-6 items-center justify-center rounded-full">
            <X size={12} colorClassName="accent-background" />
          </View>
        </Pressable>
      ) : null}
    </MobileGlassSurface>
  )
}
