import { MenuView, type MenuAction } from '@expo/ui/community/menu'
import type { ReactElement } from 'react'

import { translate } from '~/i18n/translate'
import type { ConnectionState, HostProfile } from '~/transport/types'

import {
  HOST_DISCONNECT_IMAGE,
  HOST_EDIT_IMAGE,
  HOST_RECONNECT_IMAGE,
  HOST_REMOVE_IMAGE
} from './host-menu-images'

type HostMenuActionId = 'connect' | 'disconnect' | 'edit' | 'remove'

export type HostMenuProps = {
  children: (triggerProps: HostMenuTriggerProps) => ReactElement
  connectionState: ConnectionState
  hasEverConnected: boolean
  host: HostProfile
  onDisconnect: () => void
  onEdit: () => void
  onOpenFallback: () => void
  onReconnect: () => void
  onRequestRemove: () => void
}

export type HostMenuTriggerProps = {
  onLongPress?: () => void
  onMoreActions?: () => void
}

function isLiveConnection(state: ConnectionState): boolean {
  return (
    state === 'connected' ||
    state === 'connecting' ||
    state === 'handshaking' ||
    state === 'reconnecting'
  )
}

function isHostMenuActionId(value: string): value is HostMenuActionId {
  return value === 'connect' || value === 'disconnect' || value === 'edit' || value === 'remove'
}

export function HostMenu(props: HostMenuProps): React.JSX.Element {
  const isLive = isLiveConnection(props.connectionState)
  const actions = [
    {
      id: 'connect',
      image: HOST_RECONNECT_IMAGE,
      title:
        props.hasEverConnected && isLive
          ? translate('mobile.home.reconnectHost', 'Reconnect')
          : translate('mobile.home.connectHost', 'Connect')
    },
    ...(isLive
      ? [
          {
            id: 'disconnect',
            image: HOST_DISCONNECT_IMAGE,
            title: translate('mobile.home.disconnectHost', 'Disconnect')
          }
        ]
      : []),
    {
      id: 'edit',
      image: HOST_EDIT_IMAGE,
      title: translate('mobile.home.editHost', 'Edit host')
    },
    {
      id: 'remove',
      image: HOST_REMOVE_IMAGE,
      title: translate('mobile.home.removeHost', 'Remove'),
      attributes: { destructive: true }
    }
  ] satisfies MenuAction[]

  return (
    <MenuView
      actions={actions}
      shouldOpenOnLongPress
      title={props.host.name}
      onPressAction={(event) => {
        const actionId = event.nativeEvent.event
        if (!isHostMenuActionId(actionId)) {
          return
        }
        switch (actionId) {
          case 'connect':
            props.onReconnect()
            break
          case 'disconnect':
            props.onDisconnect()
            break
          case 'edit':
            props.onEdit()
            break
          case 'remove':
            props.onRequestRemove()
            break
        }
      }}
    >
      {props.children({})}
    </MenuView>
  )
}
