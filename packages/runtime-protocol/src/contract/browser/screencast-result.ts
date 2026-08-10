import type { BrowserTabInfo } from './session-result.js'

export type BrowserScreencastReadyResult = {
  type: 'ready'
  subscriptionId: string
  browserPageId: string
  format: 'jpeg' | 'png'
  tab: BrowserTabInfo
}

export type BrowserScreencastEndResult = {
  type: 'end'
  subscriptionId: string
}

export type BrowserScreencastDialogResult = {
  type: 'dialog'
  dialogType: string
  message: string
}

export type BrowserScreencastDialogClosedResult = {
  type: 'dialogClosed'
}

export type BrowserScreencastErrorResult = {
  type: 'error'
  message: string
}

export type BrowserScreencastResult =
  | BrowserScreencastReadyResult
  | BrowserScreencastEndResult
  | BrowserScreencastDialogResult
  | BrowserScreencastDialogClosedResult
  | BrowserScreencastErrorResult
