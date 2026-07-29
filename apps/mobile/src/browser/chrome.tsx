import { Platform, TextInput, View } from 'react-native'

import {
  CaretLeft as ChevronLeft,
  CaretRight as ChevronRight,
  ArrowClockwise as RefreshCw
} from '@/components/uniwind-icons'

import { MobileGlassGroup } from '../components/glass/group'
import { MobileGlassIconButton } from '../components/glass/icon-button'
import { MobileGlassSurface } from '../components/glass/surface'
import { MobileBrowserKeyRow } from './key-row'
import { MobileBrowserPointerModifiers, type BrowserPointerModifier } from './pointer-modifiers'
import type { MobileBrowserViewMode } from './screencast-request'
import { MobileBrowserToolbarIconButton } from './toolbar-icon-button'
import { MobileBrowserViewModeSwitch } from './view-mode-switch'

export type MobileBrowserTopChromeProps = {
  addressFocused: boolean
  addressValue: string
  canGoBack: boolean
  canGoForward: boolean
  disabled: boolean
  onAddressChange: (value: string) => void
  onAddressFocusChange: (focused: boolean) => void
  onAddressSubmit: () => void
  onBackPress: () => void
  onForwardPress: () => void
  onReloadPress: () => void
  onViewModeChange: (mode: MobileBrowserViewMode) => void
  viewMode: MobileBrowserViewMode
}

export type MobileBrowserKeyboardChromeProps = {
  bottomInset: number
  disabled: boolean
  keyboardLift: number
  keyboardValue: string
  onKeyPress: (key: string) => void
  onKeyboardValueChange: (value: string) => void
  onModifierToggle: (modifier: BrowserPointerModifier) => void
  onSendPress: () => void
  selectedModifiers: BrowserPointerModifier[]
}

export function MobileBrowserTopChrome({
  addressFocused,
  addressValue,
  canGoBack,
  canGoForward,
  disabled,
  onAddressChange,
  onAddressFocusChange,
  onAddressSubmit,
  onBackPress,
  onForwardPress,
  onReloadPress,
  onViewModeChange,
  viewMode
}: MobileBrowserTopChromeProps): React.JSX.Element {
  return (
    <View className="px-2 pt-2">
      <MobileGlassGroup className="flex-row items-center gap-2" spacing={8}>
        {!addressFocused ? (
          <View className="flex-row items-center gap-2">
            <MobileBrowserToolbarIconButton
              disabled={disabled || !canGoBack}
              label="Back"
              onPress={onBackPress}
            >
              <ChevronLeft size={16} colorClassName="accent-muted-foreground" />
            </MobileBrowserToolbarIconButton>
            <MobileBrowserToolbarIconButton
              disabled={disabled || !canGoForward}
              label="Forward"
              onPress={onForwardPress}
            >
              <ChevronRight size={16} colorClassName="accent-muted-foreground" />
            </MobileBrowserToolbarIconButton>
            <MobileBrowserToolbarIconButton
              disabled={disabled}
              label="Reload"
              onPress={onReloadPress}
            >
              <RefreshCw size={16} colorClassName="accent-muted-foreground" />
            </MobileBrowserToolbarIconButton>
          </View>
        ) : null}
        <MobileGlassSurface
          className="h-8 min-w-0 flex-1 overflow-hidden rounded-full"
          isFunctional
          isInteractive={!disabled}
        >
          <TextInput
            key="browser-address"
            className="text-foreground h-full min-w-0 flex-1 px-3 py-0 text-sm leading-5"
            style={{ includeFontPadding: false, textAlignVertical: 'center' }}
            value={addressValue}
            onChangeText={onAddressChange}
            onFocus={() => onAddressFocusChange(true)}
            onBlur={() => onAddressFocusChange(false)}
            onSubmitEditing={onAddressSubmit}
            selectTextOnFocus
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={Platform.OS === 'ios' ? 'url' : 'default'}
            numberOfLines={1}
            returnKeyType="go"
            placeholder="URL"
            placeholderTextColorClassName="accent-muted-foreground"
            editable={!disabled}
          />
        </MobileGlassSurface>
        {!addressFocused ? (
          <MobileBrowserViewModeSwitch
            disabled={disabled}
            value={viewMode}
            onChange={onViewModeChange}
          />
        ) : null}
      </MobileGlassGroup>
    </View>
  )
}

export function MobileBrowserKeyboardChrome({
  bottomInset,
  disabled,
  keyboardLift,
  keyboardValue,
  onKeyPress,
  onKeyboardValueChange,
  onModifierToggle,
  onSendPress,
  selectedModifiers
}: MobileBrowserKeyboardChromeProps): React.JSX.Element {
  return (
    <MobileGlassSurface
      className="z-20 overflow-hidden rounded-t-3xl"
      isFunctional
      style={[{ paddingBottom: bottomInset, transform: [{ translateY: -keyboardLift }] }]}
    >
      <MobileBrowserPointerModifiers
        disabled={disabled}
        selectedModifiers={selectedModifiers}
        onToggle={onModifierToggle}
      />
      <MobileBrowserKeyRow disabled={disabled} onKeypress={onKeyPress} />
      <MobileGlassGroup className="flex-row items-center gap-2 px-3 pt-1 pb-2" spacing={8}>
        <MobileGlassSurface className="h-9 flex-1 overflow-hidden rounded-full" isInteractive>
          <TextInput
            className="text-foreground h-full flex-1 px-3 font-mono text-sm"
            value={keyboardValue}
            onChangeText={onKeyboardValueChange}
            placeholder="Type on page…"
            placeholderTextColorClassName="accent-muted-foreground"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!disabled}
            onSubmitEditing={onSendPress}
          />
        </MobileGlassSurface>
        <MobileGlassIconButton
          accessibilityLabel="Send text to browser"
          disabled={disabled || !keyboardValue}
          icon="send"
          onPress={onSendPress}
          size="regular"
        />
      </MobileGlassGroup>
    </MobileGlassSurface>
  )
}
