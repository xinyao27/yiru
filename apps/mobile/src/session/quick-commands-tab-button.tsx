import { MobileGlassPressable } from '@/components/glass/pressable'
import { ArrowSquareRight } from '@/components/uniwind-icons'
import { translate } from '@/i18n/translate'

type QuickCommandsTabButtonProps = {
  disabled: boolean
  onPress: () => void
}

export function QuickCommandsTabButton({
  disabled,
  onPress
}: QuickCommandsTabButtonProps): React.JSX.Element {
  return (
    <MobileGlassPressable
      accessibilityLabel={translate('mobile.session.quickCommands', 'Quick commands')}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className="rounded-full"
      contentClassName="h-9 w-9 items-center justify-center rounded-full"
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
    >
      <ArrowSquareRight size={18} colorClassName="accent-muted-foreground" />
    </MobileGlassPressable>
  )
}
