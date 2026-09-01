import { translate } from '../../i18n/translate'
import { writeCliOutput } from '../output'
import type { BrowserCliHandler } from './context'
import { displayBrowserSnapshot } from './display'
import { readBrowserFlag, readPositiveBrowserFlag, requireBrowserFlag } from './input'
import { resolveBrowserTarget } from './target'

export const BROWSER_NAVIGATION_COMMANDS: Record<string, BrowserCliHandler> = {
  snapshot: async (context) => {
    const result = await context.client.browser.snapshot(await resolveBrowserTarget(context))
    writeCliOutput(result, context.json, displayBrowserSnapshot(result))
  },
  screenshot: async (context) => {
    const result = await context.client.browser.screenshot({
      format: readBrowserFlag(context.args, 'format') === 'jpeg' ? 'jpeg' : undefined,
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(
      result,
      context.json,
      translate(`Screenshot captured (${result.format}, ${base64ByteCount(result.data)} bytes)`)
    )
  },
  goto: async (context) => {
    const result = await context.client.browser.goto({
      url: requireBrowserFlag(context.args, 'url'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate(`Navigated to ${result.url} — ${result.title}`))
  },
  back: async (context) => {
    const result = await context.client.browser.back(await resolveBrowserTarget(context))
    writeCliOutput(result, context.json, translate(`Back to ${result.url} — ${result.title}`))
  },
  reload: async (context) => {
    const result = await context.client.browser.reload(await resolveBrowserTarget(context))
    writeCliOutput(result, context.json, translate(`Reloaded ${result.url} — ${result.title}`))
  },
  forward: async (context) => {
    const result = await context.client.browser.forward(await resolveBrowserTarget(context))
    writeCliOutput(result, context.json, translate(`Navigated forward to ${result.url}`))
  },
  eval: async (context) => {
    const result = await context.client.browser.eval({
      expression: requireBrowserFlag(context.args, 'expression'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, result.result)
  },
  scroll: async (context) => {
    const direction = requireBrowserFlag(context.args, 'direction')
    if (direction !== 'up' && direction !== 'down') {
      throw new Error('cli_flag_invalid:--direction')
    }
    const result = await context.client.browser.scroll({
      amount: readPositiveBrowserFlag(context.args, 'amount'),
      direction,
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate(`Scrolled ${result.scrolled}`))
  },
  wait: async (context) => {
    const result = await context.client.browser.wait({
      fn: readBrowserFlag(context.args, 'fn'),
      load: readBrowserFlag(context.args, 'load'),
      selector: readBrowserFlag(context.args, 'selector'),
      state: readBrowserFlag(context.args, 'state'),
      text: readBrowserFlag(context.args, 'text'),
      timeout: readPositiveBrowserFlag(context.args, 'timeout'),
      url: readBrowserFlag(context.args, 'url'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, JSON.stringify(result, null, 2))
  },
  pdf: async (context) => {
    const result = await context.client.browser.pdf(await resolveBrowserTarget(context))
    writeCliOutput(
      result,
      context.json,
      translate(`PDF exported (${base64ByteCount(result.data)} bytes)`)
    )
  },
  'full-screenshot': async (context) => {
    const format = readBrowserFlag(context.args, 'format') === 'jpeg' ? 'jpeg' : 'png'
    const result = await context.client.browser.fullScreenshot({
      format,
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(
      result,
      context.json,
      translate(`Full-page screenshot captured (${result.format})`)
    )
  }
}

function base64ByteCount(payload: string): number {
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding)
}
