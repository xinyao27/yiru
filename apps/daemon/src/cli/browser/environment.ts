import { translate } from '../../i18n/translate'
import { writeCliOutput } from '../output'
import type { BrowserCliHandler } from './context'
import {
  hasBrowserFlag,
  readBrowserFlag,
  readPositiveBrowserFlag,
  requireBrowserFlag,
  requireFiniteBrowserFlag
} from './input'
import { resolveBrowserTarget } from './target'

export const BROWSER_ENVIRONMENT_COMMANDS: Record<string, BrowserCliHandler> = {
  viewport: async (context) => {
    const width = requirePositiveFlag(context.args, 'width')
    const height = requirePositiveFlag(context.args, 'height')
    const result = await context.client.browser.viewport({
      deviceScaleFactor: readPositiveBrowserFlag(context.args, 'scale'),
      height,
      mobile: hasBrowserFlag(context.args, 'mobile') || undefined,
      width,
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(
      result,
      context.json,
      translate(
        `Viewport set to ${result.width}×${result.height}${result.mobile ? ' (mobile)' : ''}`
      )
    )
  },
  geolocation: async (context) => {
    const latitude = requireFiniteBrowserFlag(context.args, 'latitude')
    const longitude = requireFiniteBrowserFlag(context.args, 'longitude')
    const result = await context.client.browser.geolocation({
      accuracy: readPositiveBrowserFlag(context.args, 'accuracy'),
      latitude,
      longitude,
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(
      result,
      context.json,
      translate(`Geolocation set to ${result.latitude}, ${result.longitude}`)
    )
  },
  'set device': async (context) => {
    const name = requireBrowserFlag(context.args, 'name')
    const result = await context.client.browser.setDevice({
      name,
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate(`Device emulation set to ${name}`))
  },
  'set offline': async (context) => {
    const state = readBrowserFlag(context.args, 'state')
    const result = await context.client.browser.setOffline({
      state,
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate(`Offline mode ${state ?? 'toggled'}`))
  },
  'set headers': async (context) => {
    const result = await context.client.browser.setHeaders({
      headers: requireBrowserFlag(context.args, 'headers'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate('Extra HTTP headers set'))
  },
  'set credentials': async (context) => {
    const user = requireBrowserFlag(context.args, 'user')
    const result = await context.client.browser.setCredentials({
      pass: requireBrowserFlag(context.args, 'pass'),
      user,
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate(`HTTP auth credentials set for ${user}`))
  },
  'set media': async (context) => {
    const result = await context.client.browser.setMedia({
      colorScheme: readBrowserFlag(context.args, 'color-scheme'),
      reducedMotion: readBrowserFlag(context.args, 'reduced-motion'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate('Media preferences set'))
  },
  'clipboard read': async (context) => {
    const result = await context.client.browser.clipboardRead(await resolveBrowserTarget(context))
    writeCliOutput(result, context.json, JSON.stringify(result, null, 2))
  },
  'clipboard write': async (context) => {
    const result = await context.client.browser.clipboardWrite({
      text: requireBrowserFlag(context.args, 'text'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate('Clipboard updated'))
  },
  'dialog accept': async (context) => {
    const result = await context.client.browser.dialogAccept({
      text: readBrowserFlag(context.args, 'text'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate('Dialog accepted'))
  },
  'dialog dismiss': async (context) => {
    const result = await context.client.browser.dialogDismiss(await resolveBrowserTarget(context))
    writeCliOutput(result, context.json, translate('Dialog dismissed'))
  }
}

function requirePositiveFlag(args: string[], name: string): number {
  const value = readPositiveBrowserFlag(args, name)
  if (value === undefined) {
    throw new Error(`cli_flag_required:--${name}`)
  }
  return value
}
