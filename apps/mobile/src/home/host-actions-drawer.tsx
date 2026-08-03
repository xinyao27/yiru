import { ActionSheetModal, type ActionSheetAction } from '~/components/action-sheet-modal'
import { BottomDrawerModalHost } from '~/components/bottom-drawer'
import { ConfirmModal } from '~/components/confirm-modal'
import {
  ArrowClockwise as RefreshCw,
  PencilSimple as Edit3,
  Power as PowerOff
} from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'
import type { ConnectionState, HostProfile } from '~/transport/types'

type HostActionsDrawerProps = {
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

function endpointLabel(endpoint: string): string {
  try {
    const url = new URL(endpoint)
    return `${url.hostname}${url.port ? `:${url.port}` : ''}`
  } catch {
    return endpoint
  }
}

export function HostActionsDrawer({
  actionTarget,
  confirmRemove,
  connectionState,
  hasEverConnected,
  onActionClose,
  onCancelRemove,
  onConfirmRemove,
  onDisconnect,
  onEdit,
  onReconnect,
  onRequestRemove
}: HostActionsDrawerProps): React.JSX.Element {
  const actions: ActionSheetAction[] = []
  if (actionTarget) {
    const isLive =
      connectionState === 'connected' ||
      connectionState === 'connecting' ||
      connectionState === 'handshaking' ||
      connectionState === 'reconnecting'
    actions.push({
      label:
        hasEverConnected && isLive
          ? translate('mobile.home.reconnectHost', 'Reconnect')
          : translate('mobile.home.connectHost', 'Connect'),
      icon: RefreshCw,
      onPress: () => onReconnect(actionTarget.id)
    })
    if (isLive) {
      actions.push({
        label: translate('mobile.home.disconnectHost', 'Disconnect'),
        icon: PowerOff,
        onPress: () => onDisconnect(actionTarget.id)
      })
    }
    actions.push({
      label: translate('mobile.home.editHost', 'Edit host'),
      icon: Edit3,
      onPress: () => onEdit(actionTarget.id)
    })
    actions.push({
      label: translate('mobile.home.removeHost', 'Remove'),
      destructive: true,
      onPress: () => {
        onActionClose()
        onRequestRemove(actionTarget)
      }
    })
  }

  return (
    <BottomDrawerModalHost
      visible={actionTarget !== null || confirmRemove !== null}
      onRequestClose={() => {
        onActionClose()
        onCancelRemove()
      }}
    >
      <ActionSheetModal
        visible={actionTarget !== null}
        title={actionTarget?.name}
        message={actionTarget ? endpointLabel(actionTarget.endpoint) : undefined}
        actions={actions}
        onClose={onActionClose}
      />

      <ConfirmModal
        visible={confirmRemove !== null}
        title={translate('mobile.home.removeHostTitle', 'Remove Host')}
        message={translate(
          'mobile.home.removeHostMessage',
          'Remove "{{name}}"? You can re-pair later.',
          { name: confirmRemove?.name ?? '' }
        )}
        confirmLabel={translate('mobile.home.removeHost', 'Remove')}
        destructive
        onConfirm={onConfirmRemove}
        onCancel={onCancelRemove}
      />
    </BottomDrawerModalHost>
  )
}
