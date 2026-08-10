import {
  handleBrowserCaptureStart,
  handleBrowserCaptureStop,
  handleBrowserConsole,
  handleBrowserEval,
  handleBrowserExec,
  handleBrowserFind,
  handleBrowserFullScreenshot,
  handleBrowserGet,
  handleBrowserHighlight,
  handleBrowserIs,
  handleBrowserNetwork,
  handleBrowserPdf,
  handleBrowserScreenshot,
  handleBrowserSnapshot
} from '~main/runtime/rpc/methods/browser-core'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: read-only inspection leaves (snapshots, screenshots, page queries, console/
// network logs, tab capture) — split out of browser.ts, direct-wired only, no mobile
// bare-channel caller for any of these (see browser.ts's own note).
export function browserInspectionLeaves() {
  return {
    snapshot: runtimeImplementation.browser.snapshot.handler(
      wireRuntimeMethod('browser.snapshot', handleBrowserSnapshot)
    ),
    screenshot: runtimeImplementation.browser.screenshot.handler(
      wireRuntimeMethod('browser.screenshot', handleBrowserScreenshot)
    ),
    fullScreenshot: runtimeImplementation.browser.fullScreenshot.handler(
      wireRuntimeMethod('browser.fullScreenshot', handleBrowserFullScreenshot)
    ),
    pdf: runtimeImplementation.browser.pdf.handler(
      wireRuntimeMethod('browser.pdf', handleBrowserPdf)
    ),
    eval: runtimeImplementation.browser.eval.handler(
      wireRuntimeMethod('browser.eval', handleBrowserEval)
    ),
    get: runtimeImplementation.browser.get.handler(
      wireRuntimeMethod('browser.get', handleBrowserGet)
    ),
    is: runtimeImplementation.browser.is.handler(wireRuntimeMethod('browser.is', handleBrowserIs)),
    find: runtimeImplementation.browser.find.handler(
      wireRuntimeMethod('browser.find', handleBrowserFind)
    ),
    console: runtimeImplementation.browser.console.handler(
      wireRuntimeMethod('browser.console', handleBrowserConsole)
    ),
    network: runtimeImplementation.browser.network.handler(
      wireRuntimeMethod('browser.network', handleBrowserNetwork)
    ),
    exec: runtimeImplementation.browser.exec.handler(
      wireRuntimeMethod('browser.exec', handleBrowserExec)
    ),
    capture: {
      start: runtimeImplementation.browser.capture.start.handler(
        wireRuntimeMethod('browser.capture.start', handleBrowserCaptureStart)
      ),
      stop: runtimeImplementation.browser.capture.stop.handler(
        wireRuntimeMethod('browser.capture.stop', handleBrowserCaptureStop)
      )
    },
    highlight: runtimeImplementation.browser.highlight.handler(
      wireRuntimeMethod('browser.highlight', handleBrowserHighlight)
    )
  } as const
}
