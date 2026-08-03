import { Button, GlassEffectContainer, HStack, VStack, type ButtonProps } from '@expo/ui/swift-ui'
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
import { useCSSVariable } from 'uniwind'

import { ExpoUiHost } from '~/components/expo-ui-host'
import { useMobileGlassAvailable } from '~/components/glass/availability'
import {
  mobileSwiftUiGlassButtonStyle,
  MobileSwiftUiGlassCircleButton
} from '~/components/glass/swift-ui-button.ios'
import { translate } from '~/i18n/translate'
import { resolveCssString } from '~/style/resolve-css-variable'

import type { MobileDiffReviewFooterProps } from './footer-props'

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
      frame({ minHeight: 44, alignment: 'center' }),
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
  const fullWidthModifiers = useMemo<ViewModifier[]>(() => [frame({ maxWidth: Infinity })], [])
  const hasGitActions = item.canStage || item.canUnstage || item.canDiscard

  return (
    <View className="pb-safe-offset-2 absolute right-0 bottom-0 left-0 px-3 pt-2">
      <ExpoUiHost layout="fill">
        <GlassEffectContainer modifiers={fullWidthModifiers} spacing={8}>
          <VStack spacing={8} modifiers={fullWidthModifiers}>
            {hasGitActions ? (
              <HStack spacing={8} modifiers={fullWidthModifiers}>
                {item.canStage ? (
                  <ReviewFooterButton
                    disabled={busyAction !== null}
                    expanded
                    label={translate('mobile.review.footer.stage', 'Stage')}
                    onPress={() => onGitMutation('git.stage', item)}
                    systemImage="plus"
                  />
                ) : null}
                {item.canUnstage ? (
                  <ReviewFooterButton
                    disabled={busyAction !== null}
                    expanded
                    label={translate('mobile.review.footer.unstage', 'Unstage')}
                    onPress={() => onGitMutation('git.unstage', item)}
                    systemImage="arrow.uturn.backward"
                  />
                ) : null}
                {item.canDiscard ? (
                  <ReviewFooterButton
                    disabled={busyAction !== null}
                    expanded
                    label={translate('mobile.review.footer.discard', 'Discard')}
                    onPress={() => onDiscard(item)}
                    role="destructive"
                    systemImage="trash"
                  />
                ) : null}
              </HStack>
            ) : null}
            <HStack spacing={8} modifiers={fullWidthModifiers}>
              <MobileSwiftUiGlassCircleButton
                label={translate('mobile.review.footer.previousFile', 'Previous file')}
                onPress={() => onMoveFile('previous')}
                size="regular"
                systemImage="chevron.left"
              />
              <ReviewFooterButton
                label={translate('mobile.review.footer.note', 'Note')}
                onPress={onAddFileNote}
                systemImage="note.text"
              />
              <ReviewFooterButton
                expanded
                label={
                  item.isReviewed
                    ? translate('mobile.review.footer.reviewed', 'Reviewed')
                    : translate('mobile.review.footer.markReviewed', 'Mark Reviewed')
                }
                onPress={onMarkReviewed}
                prominent
                systemImage="checkmark"
              />
              <MobileSwiftUiGlassCircleButton
                label={translate('mobile.review.footer.nextFile', 'Next file')}
                onPress={() => onMoveFile('next')}
                size="regular"
                systemImage="chevron.right"
              />
            </HStack>
          </VStack>
        </GlassEffectContainer>
      </ExpoUiHost>
    </View>
  )
}
