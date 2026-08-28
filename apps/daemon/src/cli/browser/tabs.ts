import { translate } from '../../i18n/translate'
import { writeCliOutput } from '../output'
import type { BrowserCliHandler } from './context'
import { displayBrowserTab, displayBrowserTabs } from './display'
import {
  hasBrowserFlag,
  readBrowserFlag,
  readNonnegativeIntegerBrowserFlag,
  requireBrowserFlag
} from './input'
import { resolveBrowserTarget, resolveBrowserWorktree } from './target'

export const BROWSER_TAB_COMMANDS: Record<string, BrowserCliHandler> = {
  'tab list': async (context) => {
    const result = await context.client.browser.tabList({
      worktree: await resolveBrowserWorktree(context)
    })
    writeCliOutput(
      result,
      context.json,
      displayBrowserTabs(result, hasBrowserFlag(context.args, 'show-profile'))
    )
  },
  'tab show': async (context) => {
    const result = await context.client.browser.tabShow({
      page: requireBrowserFlag(context.args, 'page'),
      worktree: await explicitTargetWorktree(context)
    })
    writeCliOutput(result, context.json, displayBrowserTab(result))
  },
  'tab current': async (context) => {
    const result = await context.client.browser.tabCurrent({
      worktree: await resolveBrowserWorktree(context)
    })
    writeCliOutput(result, context.json, displayBrowserTab(result))
  },
  'tab switch': async (context) => {
    const index = readNonnegativeIntegerBrowserFlag(context.args, 'index')
    const page = readBrowserFlag(context.args, 'page')
    if (index === undefined && !page) {
      throw new Error('cli_flag_required:--index-or-page')
    }
    const result = await context.client.browser.tabSwitch({
      ...(index !== undefined ? { index } : {}),
      ...(page ? { page } : {}),
      ...(hasBrowserFlag(context.args, 'focus') ? { focus: true } : {}),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(
      result,
      context.json,
      translate(`Switched to tab ${result.switched} (${result.browserPageId})`)
    )
  },
  'tab create': async (context) => {
    const result = await context.client.browser.tabCreate({
      profileId: readBrowserFlag(context.args, 'profile'),
      url: readBrowserFlag(context.args, 'url'),
      worktree: await resolveBrowserWorktree(context)
    })
    writeCliOutput(result, context.json, translate(`Created tab ${result.browserPageId}`))
  },
  'tab close': async (context) => {
    const result = await context.client.browser.tabClose({
      index: readNonnegativeIntegerBrowserFlag(context.args, 'index'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, translate('Tab closed'))
  }
}

async function explicitTargetWorktree(
  context: Parameters<BrowserCliHandler>[0]
): Promise<string | undefined> {
  return readBrowserFlag(context.args, 'worktree') ? resolveBrowserWorktree(context) : undefined
}
