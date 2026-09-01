import { daemonImplementation } from '../contract'
import { executeBrowserExec } from './exec'
import type { BrowserFileDownloadService } from './file-download'
import type { BrowserCommandDelegate } from './router'

export function createInteractionHandlers(
  delegate: BrowserCommandDelegate,
  downloads: BrowserFileDownloadService
) {
  return {
    check: daemonImplementation.browser.check.handler(({ input }) =>
      delegate('browser.check', input)
    ),
    clear: daemonImplementation.browser.clear.handler(({ input }) =>
      delegate('browser.clear', input)
    ),
    click: daemonImplementation.browser.click.handler(({ input }) =>
      delegate('browser.click', input)
    ),
    dblclick: daemonImplementation.browser.dblclick.handler(({ input }) =>
      delegate('browser.dblclick', input)
    ),
    drag: daemonImplementation.browser.drag.handler(({ input }) => delegate('browser.drag', input)),
    download: daemonImplementation.browser.download.handler(({ input }) =>
      downloads.download(input)
    ),
    eval: daemonImplementation.browser.eval.handler(({ input }) => delegate('browser.eval', input)),
    exec: daemonImplementation.browser.exec.handler(({ input }) =>
      executeBrowserExec(delegate, input)
    ),
    fill: daemonImplementation.browser.fill.handler(({ input }) => delegate('browser.fill', input)),
    find: daemonImplementation.browser.find.handler(({ input }) => delegate('browser.find', input)),
    focus: daemonImplementation.browser.focus.handler(({ input }) =>
      delegate('browser.focus', input)
    ),
    fullScreenshot: daemonImplementation.browser.fullScreenshot.handler(({ input }) =>
      delegate('browser.fullScreenshot', input)
    ),
    get: daemonImplementation.browser.get.handler(({ input }) => delegate('browser.get', input)),
    highlight: daemonImplementation.browser.highlight.handler(({ input }) =>
      delegate('browser.highlight', input)
    ),
    hover: daemonImplementation.browser.hover.handler(({ input }) =>
      delegate('browser.hover', input)
    ),
    is: daemonImplementation.browser.is.handler(({ input }) => delegate('browser.is', input)),
    keyboardInsertText: daemonImplementation.browser.keyboardInsertText.handler(({ input }) =>
      delegate('browser.keyboardInsertText', input)
    ),
    keypress: daemonImplementation.browser.keypress.handler(({ input }) =>
      delegate('browser.keypress', input)
    ),
    pdf: daemonImplementation.browser.pdf.handler(({ input }) => delegate('browser.pdf', input)),
    screenshot: daemonImplementation.browser.screenshot.handler(({ input }) =>
      delegate('browser.screenshot', input)
    ),
    scroll: daemonImplementation.browser.scroll.handler(({ input }) =>
      delegate('browser.scroll', input)
    ),
    scrollIntoView: daemonImplementation.browser.scrollIntoView.handler(({ input }) =>
      delegate('browser.scrollIntoView', input)
    ),
    select: daemonImplementation.browser.select.handler(({ input }) =>
      delegate('browser.select', input)
    ),
    selectAll: daemonImplementation.browser.selectAll.handler(({ input }) =>
      delegate('browser.selectAll', input)
    ),
    snapshot: daemonImplementation.browser.snapshot.handler(({ input }) =>
      delegate('browser.snapshot', input)
    ),
    type: daemonImplementation.browser.type.handler(({ input }) => delegate('browser.type', input)),
    upload: daemonImplementation.browser.upload.handler(({ input }) =>
      delegate('browser.upload', input)
    ),
    wait: daemonImplementation.browser.wait.handler(({ input }) => delegate('browser.wait', input))
  }
}
