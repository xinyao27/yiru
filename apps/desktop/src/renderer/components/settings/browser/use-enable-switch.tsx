import { Switch } from '~renderer/components/ui/switch'
import { translate } from '~renderer/i18n/i18n'
export function BrowserUseEnableSwitch({
  enabled,
  onToggle
}: {
  enabled: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <Switch
      checked={enabled}
      aria-label={translate(
        'auto.components.settings.BrowserUseEnableSwitch.aea3f45349',
        'Enable Agent Browser Use'
      )}
      onCheckedChange={onToggle}
    />
  )
}
