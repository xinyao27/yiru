import { requireShellRenderer } from '~main/shell/files'
import {
  getWebConnectService,
  openWebConnectBrowserSession
} from '~main/web-connect/desktop-integration'

import { runtimeImplementation } from '../../access-middleware'

export const shellWebConnectRuntimeHandlers = {
  webConnect: {
    // Why: pairing authority for this machine is a local-shell privilege, so
    // every procedure here is gated on a real renderer of this app.
    cancelPendingVerification:
      runtimeImplementation.shell.webConnect.cancelPendingVerification.handler(({ context }) => {
        requireShellRenderer(context.renderingWebContentsId)
        getWebConnectService().cancelPendingVerification()
      }),
    confirmPendingVerification:
      runtimeImplementation.shell.webConnect.confirmPendingVerification.handler(({ context }) => {
        requireShellRenderer(context.renderingWebContentsId)
        return getWebConnectService().confirmPendingVerification()
      }),
    disconnect: runtimeImplementation.shell.webConnect.disconnect.handler(({ context }) => {
      requireShellRenderer(context.renderingWebContentsId)
      getWebConnectService().disconnect()
    }),
    getStatus: runtimeImplementation.shell.webConnect.getStatus.handler(({ context }) => {
      requireShellRenderer(context.renderingWebContentsId)
      return getWebConnectService().getStatus()
    }),
    openBrowserSession: runtimeImplementation.shell.webConnect.openBrowserSession.handler(
      async ({ context }) => {
        requireShellRenderer(context.renderingWebContentsId)
        return { opened: await openWebConnectBrowserSession() }
      }
    )
  }
}
