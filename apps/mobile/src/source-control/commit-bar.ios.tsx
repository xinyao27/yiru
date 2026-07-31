import {
  Button,
  Host,
  HStack,
  ProgressView,
  Text,
  TextField,
  useNativeState
} from '@expo/ui/swift-ui'
import {
  accessibilityHint,
  accessibilityLabel,
  buttonBorderShape,
  controlSize,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
  onSubmit,
  submitLabel,
  textFieldStyle,
  tint,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { useEffect, useMemo, useRef } from 'react'
import { useCSSVariable, useUniwind } from 'uniwind'

import { useMobileGlassAvailable } from '~/components/glass/availability'
import {
  mobileSwiftUiGlassButtonStyle,
  MobileSwiftUiGlassCircleButton,
  MobileSwiftUiGlassGroup,
  MobileSwiftUiGlassInputShell
} from '~/components/glass/swift-ui.ios'
import { resolveCssString } from '~/style/resolve-css-variable'

import type { MobileSourceControlCommitBarProps } from './commit-bar-props'

export function MobileSourceControlCommitBar({
  commitMessage,
  generateDisabled,
  generatingMessage,
  hasStagedFiles,
  inputDisabled,
  isCreatePrAction,
  onChangeText,
  onGenerate,
  onPrimaryAction,
  primaryAccessibilityHint,
  primaryAccessibilityLabel,
  primaryDisabled,
  primaryLabel,
  primaryLoading,
  showGenerateButton
}: MobileSourceControlCommitBarProps): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const nativeText = useNativeState(commitMessage)
  const nativeValueRef = useRef(commitMessage)
  const { theme } = useUniwind()
  const [foregroundValue, mutedForegroundValue, primaryValue, primaryForegroundValue] =
    useCSSVariable([
      '--color-foreground',
      '--color-muted-foreground',
      '--color-primary',
      '--color-primary-foreground'
    ])
  const foregroundColor = resolveCssString(foregroundValue)
  const mutedForegroundColor = resolveCssString(mutedForegroundValue)
  const primaryColor = resolveCssString(primaryValue)
  const primaryForegroundColor = resolveCssString(primaryForegroundValue)
  const isPrimaryProminent = !primaryDisabled && !isCreatePrAction

  useEffect(() => {
    if (nativeValueRef.current !== commitMessage) {
      nativeValueRef.current = commitMessage
      nativeText.set(commitMessage)
    }
  }, [commitMessage, nativeText])

  const inputModifiers = useMemo<ViewModifier[]>(
    () => [
      textFieldStyle('plain'),
      frame({ minWidth: 120, maxWidth: Infinity, minHeight: 32, alignment: 'leading' }),
      submitLabel('done'),
      onSubmit(onPrimaryAction),
      disabledModifier(inputDisabled)
    ],
    [inputDisabled, onPrimaryAction]
  )
  const emptyTextModifiers = useMemo<ViewModifier[]>(
    () => [
      font({ textStyle: 'subheadline', weight: 'regular' }),
      foregroundStyle(mutedForegroundColor),
      frame({ minWidth: 120, maxWidth: Infinity, minHeight: 32, alignment: 'leading' })
    ],
    [mutedForegroundColor]
  )
  const primaryModifiers = useMemo<ViewModifier[]>(
    () => [
      controlSize('large'),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable, isPrimaryProminent),
      buttonBorderShape('capsule'),
      frame({ minWidth: 96, height: 44 }),
      ...(isPrimaryProminent ? [tint(primaryColor)] : []),
      accessibilityLabel(primaryAccessibilityLabel),
      ...(primaryAccessibilityHint ? [accessibilityHint(primaryAccessibilityHint)] : []),
      disabledModifier(primaryDisabled)
    ],
    [
      isGlassAvailable,
      isPrimaryProminent,
      primaryAccessibilityHint,
      primaryAccessibilityLabel,
      primaryColor,
      primaryDisabled
    ]
  )
  const primaryTextModifiers = useMemo<ViewModifier[]>(
    () => [
      font({ textStyle: 'subheadline', weight: 'semibold' }),
      foregroundStyle(
        isPrimaryProminent
          ? primaryForegroundColor
          : primaryDisabled
            ? mutedForegroundColor
            : foregroundColor
      )
    ],
    [
      foregroundColor,
      isPrimaryProminent,
      mutedForegroundColor,
      primaryDisabled,
      primaryForegroundColor
    ]
  )
  const fullWidthModifiers = useMemo<ViewModifier[]>(() => [frame({ maxWidth: Infinity })], [])

  return (
    <Host
      colorScheme={theme}
      ignoreSafeArea="keyboard"
      matchContents={{ vertical: true }}
      style={{ width: '100%', backgroundColor: 'transparent' }}
    >
      <MobileSwiftUiGlassGroup modifiers={fullWidthModifiers} spacing={8}>
        <HStack spacing={8} modifiers={fullWidthModifiers}>
          <MobileSwiftUiGlassInputShell hasTrailingAction={false} minHeight={44}>
            {hasStagedFiles ? (
              <TextField
                placeholder="Commit message"
                modifiers={inputModifiers}
                text={nativeText}
                onTextChange={(nextValue) => {
                  nativeValueRef.current = nextValue
                  onChangeText(nextValue)
                }}
              />
            ) : (
              <Text modifiers={emptyTextModifiers}>No staged files</Text>
            )}
          </MobileSwiftUiGlassInputShell>
          <Button modifiers={primaryModifiers} onPress={onPrimaryAction}>
            {primaryLoading ? (
              <ProgressView />
            ) : (
              <Text modifiers={primaryTextModifiers}>{primaryLabel}</Text>
            )}
          </Button>
          {showGenerateButton ? (
            <MobileSwiftUiGlassCircleButton
              disabled={generateDisabled}
              label={
                generatingMessage
                  ? 'Cancel commit message generation'
                  : 'Generate commit message with AI'
              }
              onPress={onGenerate}
              size="large"
              systemImage={generatingMessage ? 'xmark' : 'sparkles'}
            />
          ) : null}
        </HStack>
      </MobileSwiftUiGlassGroup>
    </Host>
  )
}
