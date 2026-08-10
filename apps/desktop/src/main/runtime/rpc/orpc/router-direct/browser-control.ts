import {
  handleBrowserAwaitGrabSelection,
  handleBrowserCancelDownload,
  handleBrowserCancelGrab,
  handleBrowserCaptureSelection,
  handleBrowserExtractHover,
  handleBrowserOpenDevTools,
  handleBrowserPageRegister,
  handleBrowserPageSetActive,
  handleBrowserPageUnregister,
  handleBrowserSetAnnotationViewport,
  handleBrowserSetGrabMode,
  handleBrowserSetViewportOverride
} from '~main/runtime/rpc/methods/browser-control'

import { runtimeImplementation } from '../access-middleware'
import { wireRuntimeMethod } from '../registered-method'

export function browserControlLeaves() {
  return {
    pageControl: {
      register: runtimeImplementation.browser.pageControl.register.handler(
        wireRuntimeMethod('browser.pageControl.register', handleBrowserPageRegister)
      ),
      unregister: runtimeImplementation.browser.pageControl.unregister.handler(
        wireRuntimeMethod('browser.pageControl.unregister', handleBrowserPageUnregister)
      ),
      setActive: runtimeImplementation.browser.pageControl.setActive.handler(
        wireRuntimeMethod('browser.pageControl.setActive', handleBrowserPageSetActive)
      ),
      openDevTools: runtimeImplementation.browser.pageControl.openDevTools.handler(
        wireRuntimeMethod('browser.pageControl.openDevTools', handleBrowserOpenDevTools)
      ),
      setViewportOverride: runtimeImplementation.browser.pageControl.setViewportOverride.handler(
        wireRuntimeMethod(
          'browser.pageControl.setViewportOverride',
          handleBrowserSetViewportOverride
        )
      ),
      setAnnotationViewport:
        runtimeImplementation.browser.pageControl.setAnnotationViewport.handler(
          wireRuntimeMethod(
            'browser.pageControl.setAnnotationViewport',
            handleBrowserSetAnnotationViewport
          )
        )
    },
    downloadCancel: runtimeImplementation.browser.downloadCancel.handler(
      wireRuntimeMethod('browser.downloadCancel', handleBrowserCancelDownload)
    ),
    grab: {
      setMode: runtimeImplementation.browser.grab.setMode.handler(
        wireRuntimeMethod('browser.grab.setMode', handleBrowserSetGrabMode)
      ),
      awaitSelection: runtimeImplementation.browser.grab.awaitSelection.handler(
        wireRuntimeMethod('browser.grab.awaitSelection', handleBrowserAwaitGrabSelection)
      ),
      cancel: runtimeImplementation.browser.grab.cancel.handler(
        wireRuntimeMethod('browser.grab.cancel', handleBrowserCancelGrab)
      ),
      captureSelection: runtimeImplementation.browser.grab.captureSelection.handler(
        wireRuntimeMethod('browser.grab.captureSelection', handleBrowserCaptureSelection)
      ),
      extractHover: runtimeImplementation.browser.grab.extractHover.handler(
        wireRuntimeMethod('browser.grab.extractHover', handleBrowserExtractHover)
      )
    }
  } as const
}
