import { assertRpcClipboardTextWriteWithinLimit } from '../clipboard-text-validation'
import { defineMethod, type RpcMethod } from '../core'
import { Fill, KeyboardInsert, Type } from './browser-schemas'

export const BROWSER_TEXT_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'browser.fill',
    params: Fill,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => {
      await assertRpcClipboardTextWriteWithinLimit(params.value)
      return browserCommands.browserFill(params)
    }
  }),
  defineMethod({
    name: 'browser.type',
    params: Type,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => {
      await assertRpcClipboardTextWriteWithinLimit(params.input)
      return browserCommands.browserType(params)
    }
  }),
  defineMethod({
    name: 'browser.keyboardInsertText',
    mobile: true,
    params: KeyboardInsert,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => {
      await assertRpcClipboardTextWriteWithinLimit(params.text)
      return browserCommands.browserKeyboardInsertText(params)
    }
  })
]
