import { Button, Host, HStack, Label, ProgressView } from '@expo/ui/swift-ui'
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
  MobileSwiftUiGlassCircleButton,
  MobileSwiftUiGlassGroup
} from '~/components/glass/swift-ui.ios'

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
      controlSize('large'),
      mobileSwiftUiGlassButtonStyle(isGlassAvailable),
      buttonBorderShape('capsule'),
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
      <MobileSwiftUiGlassGroup modifiers={fullWidthModifiers} spacing={8}>
        <HStack spacing={8} modifiers={fullWidthModifiers}>
          <MobileSourceControlBulkAction
            disabled={stageDisabled}
            label="Stage All"
            loading={stageLoading}
            onPress={onStageAll}
            systemImage="plus"
          />
          <MobileSourceControlBulkAction
            disabled={unstageDisabled}
            label="Unstage All"
            loading={unstageLoading}
            onPress={onUnstageAll}
            systemImage="minus"
          />
          <MobileSwiftUiGlassCircleButton
            disabled={actionsDisabled}
            label="More"
            onPress={onMore}
            size="large"
            systemImage="ellipsis"
          />
        </HStack>
      </MobileSwiftUiGlassGroup>
    </Host>
  )
}
