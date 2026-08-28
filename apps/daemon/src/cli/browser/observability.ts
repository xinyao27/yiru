import { translate } from '../../i18n/translate'
import { writeCliOutput } from '../output'
import type { BrowserCliHandler } from './context'
import { readBrowserFlag, readPositiveBrowserFlag } from './input'
import { resolveBrowserTarget } from './target'

export const BROWSER_OBSERVABILITY_COMMANDS: Record<string, BrowserCliHandler> = {
  'intercept enable': async (context) => {
    const patterns = readBrowserFlag(context.args, 'patterns')
      ?.split(',')
      .map((pattern) => pattern.trim())
      .filter(Boolean)
    const result = await context.client.browser.intercept.enable({
      patterns,
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(
      result,
      context.json,
      translate(`Interception enabled for: ${(result.patterns ?? []).join(', ') || '*'}`)
    )
  },
  'intercept disable': async (context) => {
    const result = await context.client.browser.intercept.disable(
      await resolveBrowserTarget(context)
    )
    writeCliOutput(result, context.json, translate('Interception disabled'))
  },
  'intercept list': async (context) => {
    const result = await context.client.browser.intercept.list(await resolveBrowserTarget(context))
    writeCliOutput(
      result,
      context.json,
      result.requests
        .map(
          (request) => `[${request.id}] ${request.method} ${request.url} (${request.resourceType})`
        )
        .join('\n') || translate('No paused requests')
    )
  },
  'capture start': async (context) => {
    const result = await context.client.browser.capture.start(await resolveBrowserTarget(context))
    writeCliOutput(result, context.json, translate('Capture started (console + network)'))
  },
  'capture stop': async (context) => {
    const result = await context.client.browser.capture.stop(await resolveBrowserTarget(context))
    writeCliOutput(result, context.json, translate('Capture stopped'))
  },
  console: async (context) => {
    const result = await context.client.browser.console({
      limit: readPositiveBrowserFlag(context.args, 'limit'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(
      result,
      context.json,
      result.entries.map((entry) => `[${entry.level}] ${entry.text}`).join('\n') ||
        translate('No console entries')
    )
  },
  network: async (context) => {
    const result = await context.client.browser.network({
      limit: readPositiveBrowserFlag(context.args, 'limit'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(
      result,
      context.json,
      result.entries
        .map((entry) => `${entry.status} ${entry.url} (${entry.mimeType}, ${entry.size}B)`)
        .join('\n') || translate('No network entries')
    )
  }
}
