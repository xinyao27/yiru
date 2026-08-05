import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { translate } from '~/i18n/translate'

import { QuickCommandsTabButton } from './quick-commands-tab-button'
import type { MobileSessionTabActionsProps } from './tab-actions-props'

export function MobileSessionTabActions({
  disabled,
  onNewTabPress,
  onQuickCommandsPress,
  showQuickCommands
}: MobileSessionTabActionsProps): React.JSX.Element {
  return (
    <MobileGlassGroup className="flex-row items-center gap-2" spacing={8}>
      <MobileGlassIconButton
        accessibilityLabel={translate('mobile.session.newTab', 'New tab')}
        disabled={disabled}
        icon="plus"
        onPress={onNewTabPress}
      />
      {showQuickCommands ? (
        <QuickCommandsTabButton disabled={disabled} onPress={onQuickCommandsPress} />
      ) : null}
    </MobileGlassGroup>
  )
}
