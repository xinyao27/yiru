import { Button, GlassEffectContainer, Host, HStack, Label, ProgressView } from '@expo/ui/swift-ui'
import {
  buttonBorderShape,
  controlSize,
  disabled as disabledModifier,
  font,
  frame,
  lineLimit,
  type ViewModifier
} from '@expo/ui/swift-ui/modifiers'
import { useMemo } from 'react'
import { useUniwind } from 'uniwind'

import { useMobileGlassAvailable } from '~/components/glass/availability'
import {
  mobileSwiftUiGlassButtonStyle,
  MobileSwiftUiGlassCircleButton
} from '~/components/glass/swift-ui-button.ios'
import { translate } from '~/i18n/translate'

import type { MobileSourceControlBulkActionsProps } from './bulk-actions-props'

function MobileSourceControlBulkAction({
  disabled,
  label,
  loading,
  onPress,
  systemImage
}: {
  disabled: boolean
  label: string
  loading: boolean
  onPress: () => void
  systemImage: 'minus' | 'plus'
}): React.JSX.Element {
  const isGlassAvailable = useMobileGlassAvailable()
  const modifiers = useMemo<ViewModifier[]>(
    () => [
      controlSize('regular'),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable),
      buttonBorderShape('capsule'),
      frame({ minHeight: 44, alignment: 'center' }),
      disabledModifier(disabled)
    ],
    [disabled, isGlassAvailable]
  )
  const labelModifiers = useMemo<ViewModifier[]>(
    () => [font({ textStyle: 'caption', weight: 'regular' }), lineLimit(1)],
    []
  )
  return (
    <Button modifiers={modifiers} onPress={onPress}>
      <HStack spacing={6}>
        {loading ? <ProgressView /> : null}
        <Label
          title={label}
          systemImage={loading ? undefined : systemImage}
          modifiers={labelModifiers}
        />
      </HStack>
    </Button>
  )
}

export function MobileSourceControlBulkActions({
  actionsDisabled,
  onMore,
  onStageAll,
  onUnstageAll,
  stageDisabled,
  stageLoading,
  unstageDisabled,
  unstageLoading
}: MobileSourceControlBulkActionsProps): React.JSX.Element {
  const { theme } = useUniwind()
  const fullWidthModifiers = useMemo<ViewModifier[]>(() => [frame({ maxWidth: Infinity })], [])

  return (
    <Host
      colorScheme={theme}
      matchContents={{ vertical: true }}
      style={{ width: '100%', backgroundColor: 'transparent', marginTop: 12 }}
    >
      <GlassEffectContainer modifiers={fullWidthModifiers} spacing={8}>
        <HStack spacing={8} modifiers={fullWidthModifiers}>
          <MobileSourceControlBulkAction
            disabled={stageDisabled}
            label={translate('mobile.sourceControl.stageAll', 'Stage All')}
            loading={stageLoading}
            onPress={onStageAll}
            systemImage="plus"
          />
          <MobileSourceControlBulkAction
            disabled={unstageDisabled}
            label={translate('mobile.sourceControl.unstageAll', 'Unstage All')}
            loading={unstageLoading}
            onPress={onUnstageAll}
            systemImage="minus"
          />
          <MobileSwiftUiGlassCircleButton
            disabled={actionsDisabled}
            label={translate('mobile.common.more', 'More')}
            onPress={onMore}
            size="regular"
            systemImage="ellipsis"
          />
        </HStack>
      </GlassEffectContainer>
    </Host>
  )
}
