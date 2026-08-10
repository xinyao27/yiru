import { handleBrowserGuestEventsSubscribe } from '~main/runtime/rpc/methods/browser-guest-events'
import {
  handleBrowserScreencast,
  handleBrowserScreencastUnsubscribe
} from '~main/runtime/rpc/methods/browser-screencast'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'
import { wireRuntimeStream } from '../registered-stream'

// Why: the two streaming surfaces — split out of browser.ts. Both are direct-wired
// only. `guestEvents.subscribe`'s one caller, the web shim, always negotiates real
// oRPC (see methods/browser-guest-events.ts). `screencast.subscribe`/`unsubscribe`
// used to keep a legacy twin for mobile's browser pane, which subscribed and tore
// down through the bare `client.subscribe`/`client.sendRequest` channel; 切片 83
// moved that call site onto `subscribeRuntimeOrpc`/`callRuntimeOrpc`, so the legacy
// registration in methods/browser-screencast.ts is gone.
export function browserStreamLeaves() {
  return {
    guestEvents: {
      subscribe: runtimeImplementation.browser.guestEvents.subscribe.handler(
        wireRuntimeStream('browser.guestEvents.subscribe', handleBrowserGuestEventsSubscribe)
      )
    },
    screencast: {
      subscribe: runtimeImplementation.browser.screencast.subscribe.handler(
        wireRuntimeStream('browser.screencast', handleBrowserScreencast)
      ),
      unsubscribe: runtimeImplementation.browser.screencast.unsubscribe.handler(
        wireRuntimeMethod('browser.screencast.unsubscribe', handleBrowserScreencastUnsubscribe)
      )
    }
  } as const
}
