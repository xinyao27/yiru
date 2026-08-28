import { daemonImplementation } from '../contract'
import type { BrowserCommandDelegate } from './router'

export function createEnvironmentHandlers(delegate: BrowserCommandDelegate) {
  return {
    clipboardRead: daemonImplementation.browser.clipboardRead.handler(({ input }) =>
      delegate('browser.clipboardRead', input)
    ),
    clipboardWrite: daemonImplementation.browser.clipboardWrite.handler(({ input }) =>
      delegate('browser.clipboardWrite', input)
    ),
    cookie: {
      delete: daemonImplementation.browser.cookie.delete.handler(({ input }) =>
        delegate('browser.cookie.delete', input)
      ),
      get: daemonImplementation.browser.cookie.get.handler(({ input }) =>
        delegate('browser.cookie.get', input)
      ),
      set: daemonImplementation.browser.cookie.set.handler(({ input }) =>
        delegate('browser.cookie.set', input)
      )
    },
    dialogAccept: daemonImplementation.browser.dialogAccept.handler(({ input }) =>
      delegate('browser.dialogAccept', input)
    ),
    dialogDismiss: daemonImplementation.browser.dialogDismiss.handler(({ input }) =>
      delegate('browser.dialogDismiss', input)
    ),
    geolocation: daemonImplementation.browser.geolocation.handler(({ input }) =>
      delegate('browser.geolocation', input)
    ),
    intercept: {
      disable: daemonImplementation.browser.intercept.disable.handler(({ input }) =>
        delegate('browser.intercept.disable', input)
      ),
      enable: daemonImplementation.browser.intercept.enable.handler(({ input }) =>
        delegate('browser.intercept.enable', input)
      ),
      list: daemonImplementation.browser.intercept.list.handler(({ input }) =>
        delegate('browser.intercept.list', input)
      )
    },
    setCredentials: daemonImplementation.browser.setCredentials.handler(({ input }) =>
      delegate('browser.setCredentials', input)
    ),
    setDevice: daemonImplementation.browser.setDevice.handler(({ input }) =>
      delegate('browser.setDevice', input)
    ),
    setHeaders: daemonImplementation.browser.setHeaders.handler(({ input }) =>
      delegate('browser.setHeaders', input)
    ),
    setMedia: daemonImplementation.browser.setMedia.handler(({ input }) =>
      delegate('browser.setMedia', input)
    ),
    setOffline: daemonImplementation.browser.setOffline.handler(({ input }) =>
      delegate('browser.setOffline', input)
    ),
    storage: {
      local: {
        clear: daemonImplementation.browser.storage.local.clear.handler(({ input }) =>
          delegate('browser.storage.local.clear', input)
        ),
        get: daemonImplementation.browser.storage.local.get.handler(({ input }) =>
          delegate('browser.storage.local.get', input)
        ),
        set: daemonImplementation.browser.storage.local.set.handler(({ input }) =>
          delegate('browser.storage.local.set', input)
        )
      },
      session: {
        clear: daemonImplementation.browser.storage.session.clear.handler(({ input }) =>
          delegate('browser.storage.session.clear', input)
        ),
        get: daemonImplementation.browser.storage.session.get.handler(({ input }) =>
          delegate('browser.storage.session.get', input)
        ),
        set: daemonImplementation.browser.storage.session.set.handler(({ input }) =>
          delegate('browser.storage.session.set', input)
        )
      }
    },
    viewport: daemonImplementation.browser.viewport.handler(({ input }) =>
      delegate('browser.viewport', input)
    )
  }
}
