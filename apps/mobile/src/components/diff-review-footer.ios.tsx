import { Button, Host, HStack, VStack, type ButtonProps } from '@expo/ui/swift-ui'
import {
  buttonBorderShape,
  controlSize,
  disabled as disabledModifier,
  frame,
  tint,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { useMemo } from 'react'
import { View } from 'react-native'
import { useCSSVariable, useUniwind } from 'uniwind'

import { useMobileGlassAvailable } from '@/components/glass/availability'
import {
  mobileSwiftUiGlassButtonStyle,
  MobileSwiftUiGlassCircleButton,
  MobileSwiftUiGlassGroup
} from '@/components/glass/swift-ui.ios'
import { resolveCssString } from '@/style/resolve-css-variable'

import type { MobileDiffReviewFooterProps } from './diff-review-footer-props'

type FooterButtonProps = {
  disabled?: boolean
  expanded?: boolean
  label: string
  onPress: () => void
  prominent?: boolean
  role?: ButtonProps['role']
  systemImage: NonNullable<ButtonProps['systemImage']>
}

function ReviewFooterButton({
  disabled = false,
  expanded = false,
  label,
  onPress,
  prominent = false,
  role,
  systemImage
}: FooterButtonProps): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const primaryColor = resolveCssString(useCSSVariable('--color-primary'))
  const modifiers = useMemo<ViewModifier[]>(
    () => [
      controlSize('regular'),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable, prominent),
      buttonBorderShape('capsule'),
      ...(expanded ? [frame({ maxWidth: Infinity })] : []),
      ...(prominent ? [tint(primaryColor)] : []),
      disabledModifier(disabled)
    ],
    [disabled, expanded, isGlassAvailable, primaryColor, prominent]
  )

  return (
    <Button
      label={label}
      modifiers={modifiers}
      onPress={onPress}
      role={role}
      systemImage={systemImage}
    />
  )
}

export function MobileDiffReviewFooter({
  busyAction,
  item,
  onAddFileNote,
  onDiscard,
  onGitMutation,
  onMarkReviewed,
  onMoveFile
}: MobileDiffReviewFooterProps): React.JSX.Element {
  const { theme } = useUniwind()
  const fullWidthModifiers = useMemo<ViewModifier[]>(() => [frame({ maxWidth: Infinity })], [])
  const hasGitActions = item.canStage || item.canUnstage || item.canDiscard

  return (
    <View className="pb-safe-offset-2 absolute right-0 bottom-0 left-0 px-3 pt-2">
      <Host
        colorScheme={theme}
        matchContents={{ vertical: true }}
        style={{ width: '100%', backgroundColor: 'transparent' }}
      >
        <MobileSwiftUiGlassGroup modifiers={fullWidthModifiers} spacing={8}>
          <VStack spacing={8} modifiers={fullWidthModifiers}>
            {hasGitActions ? (
              <HStack spacing={8} modifiers={fullWidthModifiers}>
                {item.canStage ? (
                  <ReviewFooterButton
                    disabled={busyAction !== null}
                    expanded
                    label="Stage"
                    onPress={() => onGitMutation('git.stage', item)}
                    systemImage="plus"
                  />
                ) : null}
                {item.canUnstage ? (
                  <ReviewFooterButton
                    disabled={busyAction !== null}
                    expanded
                    label="Unstage"
                    onPress={() => onGitMutation('git.unstage', item)}
                    systemImage="arrow.uturn.backward"
                  />
                ) : null}
                {item.canDiscard ? (
                  <ReviewFooterButton
                    disabled={busyAction !== null}
                    expanded
                    label="Discard"
                    onPress={() => onDiscard(item)}
                    role="destructive"
                    systemImage="trash"
                  />
                ) : null}
              </HStack>
            ) : null}
            <HStack spacing={8} modifiers={fullWidthModifiers}>
              <MobileSwiftUiGlassCircleButton
                label="Previous file"
                onPress={() => onMoveFile('previous')}
                size="regular"
                systemImage="chevron.left"
              />
              <ReviewFooterButton label="Note" onPress={onAddFileNote} systemImage="note.text" />
              <ReviewFooterButton
                expanded
                label={item.isReviewed ? 'Reviewed' : 'Mark Reviewed'}
                onPress={onMarkReviewed}
                prominent
                systemImage="checkmark"
              />
              <MobileSwiftUiGlassCircleButton
                label="Next file"
                onPress={() => onMoveFile('next')}
                size="regular"
                systemImage="chevron.right"
              />
            </HStack>
          </VStack>
        </MobileSwiftUiGlassGroup>
      </Host>
    </View>
  )
}
