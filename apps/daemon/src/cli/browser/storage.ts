import { translate } from '../../i18n/translate'
import { writeCliOutput } from '../output'
import type { BrowserCliContext, BrowserCliHandler } from './context'
import { requireBrowserFlag } from './input'
import { resolveBrowserTarget } from './target'

export const BROWSER_STORAGE_COMMANDS: Record<string, BrowserCliHandler> = {
  'storage local get': storageGet('local'),
  'storage local set': storageSet('local'),
  'storage local clear': storageClear('local'),
  'storage session get': storageGet('session'),
  'storage session set': storageSet('session'),
  'storage session clear': storageClear('session')
}

type StorageKind = 'local' | 'session'

function storageGet(kind: StorageKind): BrowserCliHandler {
  return async (context) => {
    const result = await context.client.browser.storage[kind].get({
      key: requireBrowserFlag(context.args, 'key'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, JSON.stringify(result, null, 2))
  }
}

function storageSet(kind: StorageKind): BrowserCliHandler {
  return async (context) => {
    const key = requireBrowserFlag(context.args, 'key')
    const result = await context.client.browser.storage[kind].set({
      key,
      value: requireBrowserFlag(context.args, 'value'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate(`${storageName(kind)}["${key}"] set`))
  }
}

function storageClear(kind: StorageKind): BrowserCliHandler {
  return async (context: BrowserCliContext) => {
    const result = await context.client.browser.storage[kind].clear(
      await resolveBrowserTarget(context)
    )
    writeCliOutput(result, context.json, translate(`${storageName(kind)} cleared`))
  }
}

function storageName(kind: StorageKind): string {
  return kind === 'local' ? 'localStorage' : 'sessionStorage'
}
