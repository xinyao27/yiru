import { MobileSwiftUiGlassAccessoryButton } from '~/components/glass/swift-ui.ios'
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
    <MobileSwiftUiGlassAccessoryButton
      accessibilityLabel={translate('mobile.session.quickCommands', 'Quick commands')}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      shape="circle"
      size="regular"
      systemImage="arrow.right.square"
    />
  )
}
