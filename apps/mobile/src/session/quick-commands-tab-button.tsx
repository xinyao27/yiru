import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { translate } from '~/i18n/translate'

type QuickCommandsTabButtonProps = {
  disabled: boolean
  onPress: () => void
}

export function QuickCommandsTabButton({
  disabled,
  onPress
}: QuickCommandsTabButtonProps): React.JSX.Element {
  return (
    <MobileGlassIconButton
      accessibilityLabel={translate('mobile.session.quickCommands', 'Quick commands')}
      disabled={disabled}
      hitSlop={4}
      icon="quick-commands"
      onPress={onPress}
    />
  )
}
