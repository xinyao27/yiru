import type {
  BrowserFillInput,
  BrowserKeyboardInsertInput,
  BrowserTypeInput
} from '@yiru/runtime-protocol/contract'

import { assertRpcClipboardTextWriteWithinLimit } from '../clipboard-text-validation'
import type { RpcContext } from '../core'

export const handleBrowserFill = async (
  params: BrowserFillInput,
  { browserCommands }: RpcContext
) => {
  await assertRpcClipboardTextWriteWithinLimit(params.value)
  return browserCommands.browserFill(params)
}

export const handleBrowserType = async (
  params: BrowserTypeInput,
  { browserCommands }: RpcContext
) => {
  await assertRpcClipboardTextWriteWithinLimit(params.input)
  return browserCommands.browserType(params)
}

export const handleBrowserKeyboardInsertText = async (
  params: BrowserKeyboardInsertInput,
  { browserCommands }: RpcContext
) => {
  await assertRpcClipboardTextWriteWithinLimit(params.text)
  return browserCommands.browserKeyboardInsertText(params)
}
