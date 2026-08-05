import { MobileGlassGroup } from '~/components/glass/group'
import { MobileGlassIconButton } from '~/components/glass/icon-button'
import { translate } from '~/i18n/translate'

import type { MobileSessionTabActionsProps } from './tab-actions-props'

export function MobileSessionTabActions({
  disabled,
  onNewTabPress
}: MobileSessionTabActionsProps): React.JSX.Element {
  return (
    <MobileGlassGroup className="flex-row items-center" spacing={8}>
      <MobileGlassIconButton
        accessibilityLabel={translate('mobile.session.newTab', 'New tab')}
        disabled={disabled}
        icon="plus"
        onPress={onNewTabPress}
      />
    </MobileGlassGroup>
  )
}
