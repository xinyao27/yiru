import type {
  BrowserAnnotationViewportInput,
  BrowserDownloadCancelInput,
  BrowserGrabAwaitInput,
  BrowserGrabCaptureInput,
  BrowserGrabSetModeInput,
  BrowserPageIdInput,
  BrowserPageRegisterInput,
  BrowserPageUnregisterInput,
  BrowserViewportOverrideInput
} from '@yiru/runtime-protocol/contract'

import type { RpcContext } from '../core'

export const handleBrowserPageRegister = (
  input: BrowserPageRegisterInput,
  { browserCommands, shellConnectionId }: RpcContext
) => browserCommands.browserPageRegister(input, shellConnectionId)

export const handleBrowserPageUnregister = (
  input: BrowserPageUnregisterInput,
  { browserCommands, shellConnectionId }: RpcContext
) => browserCommands.browserPageUnregister(input, shellConnectionId)

export const handleBrowserPageSetActive = (
  input: BrowserPageIdInput,
  { browserCommands, shellConnectionId }: RpcContext
) => browserCommands.browserPageSetActive(input, shellConnectionId)

export const handleBrowserOpenDevTools = (
  input: BrowserPageIdInput,
  { browserCommands, shellConnectionId }: RpcContext
) => browserCommands.browserOpenDevTools(input, shellConnectionId)

export const handleBrowserSetViewportOverride = (
  input: BrowserViewportOverrideInput,
  { browserCommands, shellConnectionId }: RpcContext
) => browserCommands.browserSetViewportOverride(input, shellConnectionId)

export const handleBrowserSetAnnotationViewport = (
  input: BrowserAnnotationViewportInput,
  { browserCommands, shellConnectionId }: RpcContext
) => browserCommands.browserSetAnnotationViewport(input, shellConnectionId)

export const handleBrowserCancelDownload = (
  input: BrowserDownloadCancelInput,
  { browserCommands, shellConnectionId }: RpcContext
) => browserCommands.browserCancelDownload(input, shellConnectionId)

export const handleBrowserSetGrabMode = (
  input: BrowserGrabSetModeInput,
  { browserCommands, shellConnectionId }: RpcContext
) => browserCommands.browserSetGrabMode(input, shellConnectionId)

export const handleBrowserAwaitGrabSelection = (
  input: BrowserGrabAwaitInput,
  { browserCommands, shellConnectionId }: RpcContext
) => browserCommands.browserAwaitGrabSelection(input, shellConnectionId)

export const handleBrowserCancelGrab = (
  input: BrowserPageIdInput,
  { browserCommands, shellConnectionId }: RpcContext
) => browserCommands.browserCancelGrab(input, shellConnectionId)

export const handleBrowserCaptureSelection = (
  input: BrowserGrabCaptureInput,
  { browserCommands, shellConnectionId }: RpcContext
) => browserCommands.browserCaptureSelection(input, shellConnectionId)

export const handleBrowserExtractHover = (
  input: BrowserPageIdInput,
  { browserCommands, shellConnectionId }: RpcContext
) => browserCommands.browserExtractHover(input, shellConnectionId)
