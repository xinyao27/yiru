import { translate } from '../../i18n/i18n'
import type { ExtensionRuntimeBootstrap } from './session'

export function extensionRuntimeSocketUrl(bootstrap: ExtensionRuntimeBootstrap): URL {
  const url = new URL(bootstrap.endpoint)
  url.searchParams.set('protocolVersion', String(bootstrap.protocolVersion))
  url.searchParams.set('token', bootstrap.authToken)
  return url
}

export async function waitForExtensionRuntimeSocket(
  socket: WebSocket,
  timeoutMs = 12_000
): Promise<void> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      socket.removeEventListener('open', handleOpen)
      socket.removeEventListener('error', handleError)
      timeoutSignal.removeEventListener('abort', handleAbort)
    }
    const handleOpen = (): void => {
      cleanup()
      resolve()
    }
    const handleError = (): void => {
      cleanup()
      reject(
        new Error(
          translate('extension.runtime.connectionFailed', 'Failed to connect to the Yiru daemon.')
        )
      )
    }
    const handleAbort = (): void => {
      cleanup()
      socket.close()
      reject(
        new Error(
          translate(
            'extension.runtime.connectionTimedOut',
            'Timed out while connecting to the Yiru daemon.'
          )
        )
      )
    }
    socket.addEventListener('open', handleOpen, { once: true })
    socket.addEventListener('error', handleError, { once: true })
    timeoutSignal.addEventListener('abort', handleAbort, { once: true })
  })
}
