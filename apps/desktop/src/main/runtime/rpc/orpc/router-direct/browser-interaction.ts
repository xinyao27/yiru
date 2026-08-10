import {
  handleBrowserCheck,
  handleBrowserClear,
  handleBrowserClick,
  handleBrowserDblclick,
  handleBrowserDrag,
  handleBrowserFocus,
  handleBrowserHover,
  handleBrowserKeypress,
  handleBrowserScroll,
  handleBrowserScrollIntoView,
  handleBrowserSelect,
  handleBrowserSelectAll,
  handleBrowserUpload,
  handleBrowserWait
} from '~main/runtime/rpc/methods/browser-core'
import {
  handleBrowserMouseClick,
  handleBrowserMouseDown,
  handleBrowserMouseMove,
  handleBrowserMouseUp,
  handleBrowserMouseWheel
} from '~main/runtime/rpc/methods/browser-extras'
import {
  handleBrowserFill,
  handleBrowserKeyboardInsertText,
  handleBrowserType
} from '~main/runtime/rpc/methods/browser-text-rpc-methods'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

// Why: input/interaction leaves — split out of browser.ts (see that file's own note on
// why 95 leaves under one `browser` contract key can't fit in a single 300-line file).
// `keypress`/`keyboardInsertText`/`mouseMove`/`mouseDown`/`mouseUp`/`mouseClick`/
// `mouseWheel` used to keep a legacy twin for mobile's bare-string channel; 切片 83
// moved that caller onto `callRuntimeOrpc`, so this whole group is direct-wired only.
export function browserInteractionLeaves() {
  return {
    click: runtimeImplementation.browser.click.handler(
      wireRuntimeMethod('browser.click', handleBrowserClick)
    ),
    dblclick: runtimeImplementation.browser.dblclick.handler(
      wireRuntimeMethod('browser.dblclick', handleBrowserDblclick)
    ),
    hover: runtimeImplementation.browser.hover.handler(
      wireRuntimeMethod('browser.hover', handleBrowserHover)
    ),
    focus: runtimeImplementation.browser.focus.handler(
      wireRuntimeMethod('browser.focus', handleBrowserFocus)
    ),
    clear: runtimeImplementation.browser.clear.handler(
      wireRuntimeMethod('browser.clear', handleBrowserClear)
    ),
    selectAll: runtimeImplementation.browser.selectAll.handler(
      wireRuntimeMethod('browser.selectAll', handleBrowserSelectAll)
    ),
    drag: runtimeImplementation.browser.drag.handler(
      wireRuntimeMethod('browser.drag', handleBrowserDrag)
    ),
    upload: runtimeImplementation.browser.upload.handler(
      wireRuntimeMethod('browser.upload', handleBrowserUpload)
    ),
    scroll: runtimeImplementation.browser.scroll.handler(
      wireRuntimeMethod('browser.scroll', handleBrowserScroll)
    ),
    scrollIntoView: runtimeImplementation.browser.scrollIntoView.handler(
      wireRuntimeMethod('browser.scrollIntoView', handleBrowserScrollIntoView)
    ),
    select: runtimeImplementation.browser.select.handler(
      wireRuntimeMethod('browser.select', handleBrowserSelect)
    ),
    check: runtimeImplementation.browser.check.handler(
      wireRuntimeMethod('browser.check', handleBrowserCheck)
    ),
    wait: runtimeImplementation.browser.wait.handler(
      wireRuntimeMethod('browser.wait', handleBrowserWait)
    ),
    fill: runtimeImplementation.browser.fill.handler(
      wireRuntimeMethod('browser.fill', handleBrowserFill)
    ),
    type: runtimeImplementation.browser.type.handler(
      wireRuntimeMethod('browser.type', handleBrowserType)
    ),
    keyboardInsertText: runtimeImplementation.browser.keyboardInsertText.handler(
      wireRuntimeMethod('browser.keyboardInsertText', handleBrowserKeyboardInsertText)
    ),
    keypress: runtimeImplementation.browser.keypress.handler(
      wireRuntimeMethod('browser.keypress', handleBrowserKeypress)
    ),
    mouseMove: runtimeImplementation.browser.mouseMove.handler(
      wireRuntimeMethod('browser.mouseMove', handleBrowserMouseMove)
    ),
    mouseDown: runtimeImplementation.browser.mouseDown.handler(
      wireRuntimeMethod('browser.mouseDown', handleBrowserMouseDown)
    ),
    mouseUp: runtimeImplementation.browser.mouseUp.handler(
      wireRuntimeMethod('browser.mouseUp', handleBrowserMouseUp)
    ),
    mouseClick: runtimeImplementation.browser.mouseClick.handler(
      wireRuntimeMethod('browser.mouseClick', handleBrowserMouseClick)
    ),
    mouseWheel: runtimeImplementation.browser.mouseWheel.handler(
      wireRuntimeMethod('browser.mouseWheel', handleBrowserMouseWheel)
    )
  } as const
}
