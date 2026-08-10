import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/message-port'
import { MessageChannelMain, type WebContents } from 'electron'
import {
  SHELL_SERVICES_CONNECT_CHANNEL,
  SHELL_SERVICES_CONNECT_MESSAGE
} from '~shared/shell-services-message-port'

import { electronShellServicesConnectionId } from './shell-services-identity'
import {
  type ShellServicesConnection,
  type ShellServicesClient,
  removeShellServicesConnection,
  replaceShellServicesConnection
} from './shell-services-reverse-link'

// Why: only a local Electron MessagePort has a paired renderer shell.
export function connectShellServicesReverseLink(sender: WebContents): void {
  const shellConnectionId = electronShellServicesConnectionId(sender.id)
  const { port1, port2 } = new MessageChannelMain()
  port1.start()

  const link = new RPCLink<Record<never, never>>({ port: port1 })
  const client = createORPCClient<ShellServicesClient>(link)
  let isClosed = false
  const connection: ShellServicesConnection = {
    client,
    close: (): void => {
      if (isClosed) {
        return
      }
      isClosed = true
      sender.off('destroyed', connection.close)
      port1.off('close', connection.close)
      removeShellServicesConnection(shellConnectionId, connection)
      port1.close()
    }
  }

  port1.once('close', connection.close)
  sender.once('destroyed', connection.close)
  replaceShellServicesConnection(shellConnectionId, connection)

  try {
    sender.postMessage(SHELL_SERVICES_CONNECT_CHANNEL, { type: SHELL_SERVICES_CONNECT_MESSAGE }, [
      port2
    ])
  } catch (error) {
    console.error('[shell-services] failed to hand the reverse port to the renderer', error)
    connection.close()
    return
  }

  void client
    .ping()
    .then((result) => {
      console.info('[shell-services] reverse ping ok', result)
    })
    .catch((error) => {
      console.error('[shell-services] reverse ping failed', error)
    })
}
