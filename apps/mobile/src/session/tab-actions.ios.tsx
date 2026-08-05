import { GlassEffectContainer, HStack, Host } from '@expo/ui/swift-ui'
import { useUniwind } from 'uniwind'

import { MobileSwiftUiGlassCircleButton } from '~/components/glass/swift-ui-button.ios'
import { translate } from '~/i18n/translate'

import type { MobileSessionTabActionsProps } from './tab-actions-props'

export function MobileSessionTabActions({
  disabled,
  onNewTabPress,
  onQuickCommandsPress,
  showQuickCommands
}: MobileSessionTabActionsProps): React.JSX.Element {
  const { theme } = useUniwind()

  return (
    <Host colorScheme={theme} matchContents style={{ backgroundColor: 'transparent' }}>
      <GlassEffectContainer spacing={8}>
        <HStack spacing={0}>
          <MobileSwiftUiGlassCircleButton
            disabled={disabled}
            label={translate('mobile.session.newTab', 'New tab')}
            onPress={onNewTabPress}
            size="regular"
            systemImage="plus"
          />
          {showQuickCommands ? (
            <MobileSwiftUiGlassCircleButton
              disabled={disabled}
              label={translate('mobile.session.quickCommands', 'Quick commands')}
              onPress={onQuickCommandsPress}
              size="regular"
              systemImage="arrow.right.square"
            />
          ) : null}
        </HStack>
      </GlassEffectContainer>
    </Host>
  )
}
