import { ActionSheetModal, type ActionSheetAction } from '~/components/action-sheet-modal'
import { BottomDrawerModalHost } from '~/components/bottom-drawer'
import { ConfirmModal } from '~/components/confirm-modal'
import {
  ArrowClockwise as RefreshCw,
  PencilSimple as Edit3,
  Power as PowerOff,
  Trash
} from '~/components/uniwind-icons'
import { translate } from '~/i18n/translate'

import type { HostActionsDrawerProps } from './host-actions-drawer'

function endpointLabel(endpoint: string): string {
  try {
    const url = new URL(endpoint)
    return `${url.hostname}${url.port ? `:${url.port}` : ''}`
  } catch {
    return endpoint
  }
}

export function HostActionsDrawer(props: HostActionsDrawerProps): React.JSX.Element {
  const actions: ActionSheetAction[] = []
  const actionTarget = props.actionTarget
  if (actionTarget) {
    const isLive =
      props.connectionState === 'connected' ||
      props.connectionState === 'connecting' ||
      props.connectionState === 'handshaking' ||
      props.connectionState === 'reconnecting'
    actions.push({
      id: 'connect',
      label:
        props.hasEverConnected && isLive
          ? translate('mobile.home.reconnectHost', 'Reconnect')
          : translate('mobile.home.connectHost', 'Connect'),
      icon: RefreshCw,
      dismiss: 'manual',
      onPress: () => props.onReconnect(actionTarget.id)
    })
    if (isLive) {
      actions.push({
        id: 'disconnect',
        label: translate('mobile.home.disconnectHost', 'Disconnect'),
        icon: PowerOff,
        dismiss: 'manual',
        onPress: () => props.onDisconnect(actionTarget.id)
      })
    }
    actions.push({
      id: 'edit',
      label: translate('mobile.home.editHost', 'Edit host'),
      icon: Edit3,
      dismiss: 'manual',
      onPress: () => props.onEdit(actionTarget.id)
    })
    actions.push({
      id: 'remove',
      label: translate('mobile.home.removeHost', 'Remove'),
      icon: Trash,
      dismiss: 'manual',
      destructive: true,
      onPress: () => {
        props.onActionClose()
        props.onRequestRemove(actionTarget)
      }
    })
  }

  return (
    <BottomDrawerModalHost
      visible={props.actionTarget !== null || props.confirmRemove !== null}
      onRequestClose={() => {
        props.onActionClose()
        props.onCancelRemove()
      }}
    >
      <ActionSheetModal
        visible={props.actionTarget !== null}
        title={props.actionTarget?.name}
        message={props.actionTarget ? endpointLabel(props.actionTarget.endpoint) : undefined}
        actions={actions}
        onClose={props.onActionClose}
      />

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
