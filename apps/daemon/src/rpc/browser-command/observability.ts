import { daemonImplementation } from '../contract'
import type { BrowserCommandDelegate } from './router'

export function createObservabilityHandlers(delegate: BrowserCommandDelegate) {
  return {
    capture: {
      start: daemonImplementation.browser.capture.start.handler(({ input }) =>
        delegate('browser.capture.start', input)
      ),
      stop: daemonImplementation.browser.capture.stop.handler(({ input }) =>
        delegate('browser.capture.stop', input)
      )
    },
    console: daemonImplementation.browser.console.handler(({ input }) =>
      delegate('browser.console', input)
    ),
    mouseClick: daemonImplementation.browser.mouseClick.handler(({ input }) =>
      delegate('browser.mouseClick', input)
    ),
    mouseDown: daemonImplementation.browser.mouseDown.handler(({ input }) =>
      delegate('browser.mouseDown', input)
    ),
    mouseMove: daemonImplementation.browser.mouseMove.handler(({ input }) =>
      delegate('browser.mouseMove', input)
    ),
    mouseUp: daemonImplementation.browser.mouseUp.handler(({ input }) =>
      delegate('browser.mouseUp', input)
    ),
    mouseWheel: daemonImplementation.browser.mouseWheel.handler(({ input }) =>
      delegate('browser.mouseWheel', input)
    ),
    network: daemonImplementation.browser.network.handler(({ input }) =>
      delegate('browser.network', input)
    )
  }
}
