import { Text } from 'react-native'

import { translate } from '~/i18n/translate'

import { BottomDrawer } from './bottom-drawer'
import { MobileGlassGroup } from './glass/group'
import { MobileGlassTextButton } from './glass/text-button'

type Props = {
  visible: boolean
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = translate('mobile.common.confirm', 'Confirm'),
  cancelLabel = translate('mobile.common.cancel', 'Cancel'),
  destructive = false,
  onConfirm,
  onCancel
}: Props): React.JSX.Element {
  return (
    <BottomDrawer visible={visible} onClose={onCancel} title={title}>
      {message ? (
        <Text className="text-muted-foreground pb-4 text-sm leading-5">{message}</Text>
      ) : null}
      <MobileGlassGroup className="flex-row gap-2" spacing={8}>
        <MobileGlassTextButton
          className="flex-1"
          isFullWidth
          label={cancelLabel}
          onPress={onCancel}
        />
        <MobileGlassTextButton
          className="flex-1"
          isDestructive={destructive}
          isFullWidth
          isProminent={!destructive}
          label={confirmLabel}
          onPress={onConfirm}
        />
      </MobileGlassGroup>
    </BottomDrawer>
  )
}
