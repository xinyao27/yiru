import { translate } from '../../i18n/translate'
import { writeCliOutput } from '../output'
import type { BrowserCliHandler } from './context'
import { hasBrowserFlag, readBrowserFlag, readFiniteBrowserFlag, requireBrowserFlag } from './input'
import { resolveBrowserTarget } from './target'

export const BROWSER_COOKIE_COMMANDS: Record<string, BrowserCliHandler> = {
  'cookie get': async (context) => {
    const result = await context.client.browser.cookie.get({
      url: readBrowserFlag(context.args, 'url'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(
      result,
      context.json,
      result.cookies
        .map((cookie) => `${cookie.name}=${cookie.value} (${cookie.domain})`)
        .join('\n') || translate('No cookies')
    )
  },
  'cookie set': async (context) => {
    const name = requireBrowserFlag(context.args, 'name')
    const expires = readFiniteBrowserFlag(context.args, 'expires')
    if (expires !== undefined && expires < 0) {
      throw new Error('cli_flag_invalid:--expires')
    }
    const result = await context.client.browser.cookie.set({
      domain: readBrowserFlag(context.args, 'domain'),
      expires,
      httpOnly: hasBrowserFlag(context.args, 'httpOnly') || undefined,
      name,
      path: readBrowserFlag(context.args, 'path'),
      sameSite: readBrowserFlag(context.args, 'sameSite'),
      secure: hasBrowserFlag(context.args, 'secure') || undefined,
      value: requireBrowserFlag(context.args, 'value'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(
      result,
      context.json,
      translate(result.success ? `Cookie "${name}" set` : `Failed to set cookie "${name}"`)
    )
  },
  'cookie delete': async (context) => {
    const name = requireBrowserFlag(context.args, 'name')
    const result = await context.client.browser.cookie.delete({
      domain: readBrowserFlag(context.args, 'domain'),
      name,
      url: readBrowserFlag(context.args, 'url'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate(`Cookie "${name}" deleted`))
  }
}
