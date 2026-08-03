import { BottomDrawerModalHost } from '~/components/bottom-drawer'
import { ConfirmModal } from '~/components/confirm-modal'
import { translate } from '~/i18n/translate'
import type { ConnectionState, HostProfile } from '~/transport/types'

export type HostActionsDrawerProps = {
  actionTarget: HostProfile | null
  confirmRemove: HostProfile | null
  connectionState: ConnectionState | null
  hasEverConnected: boolean
  onActionClose: () => void
  onCancelRemove: () => void
  onConfirmRemove: () => void
  onDisconnect: (hostId: string) => void
  onEdit: (hostId: string) => void
  onReconnect: (hostId: string) => void
  onRequestRemove: (host: HostProfile) => void
}

export function HostActionsDrawer(props: HostActionsDrawerProps): React.JSX.Element {
  return (
    <BottomDrawerModalHost
      visible={props.confirmRemove !== null}
      onRequestClose={props.onCancelRemove}
    >
      <ConfirmModal
        visible={props.confirmRemove !== null}
        title={translate('mobile.home.removeHostTitle', 'Remove Host')}
        message={translate(
          'mobile.home.removeHostMessage',
          'Remove "{{name}}"? You can re-pair later.',
          { name: props.confirmRemove?.name ?? '' }
        )}
        confirmLabel={translate('mobile.home.removeHost', 'Remove')}
        destructive
        onConfirm={props.onConfirmRemove}
        onCancel={props.onCancelRemove}
      />
    </BottomDrawerModalHost>
  )
}
