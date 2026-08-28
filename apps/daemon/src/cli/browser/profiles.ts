import { translate } from '../../i18n/translate'
import { writeCliOutput } from '../output'
import type { BrowserCliHandler } from './context'
import { displayBrowserProfiles, displayClonedTab, displayTabProfile } from './display'
import { readBrowserFlag, requireBrowserFlag } from './input'
import { resolveBrowserTarget } from './target'

export const BROWSER_PROFILE_COMMANDS: Record<string, BrowserCliHandler> = {
  'tab profile list': async (context) => {
    const result = await context.client.browser.profileList()
    writeCliOutput(result, context.json, displayBrowserProfiles(result))
  },
  'tab profile create': async (context) => {
    const label = requireBrowserFlag(context.args, 'label')
    const scope = parseProfileScope(readBrowserFlag(context.args, 'scope'))
    const result = await context.client.browser.profileCreate({ label, scope })
    if (!result.profile) {
      throw new Error('browser_profile_create_rejected')
    }
    writeCliOutput(
      result,
      context.json,
      translate(`Created profile ${result.profile.id} (${result.profile.label})`)
    )
  },
  'tab profile delete': async (context) => {
    const profileId = requireBrowserFlag(context.args, 'profile')
    const result = await context.client.browser.profileDelete({ profileId })
    writeCliOutput(
      result,
      context.json,
      translate(
        result.deleted
          ? `Deleted profile ${result.profileId}`
          : `Profile ${result.profileId} was not deleted`
      )
    )
  },
  'tab profile set': setTabProfile(false),
  'tab profile use-default': setTabProfile(true),
  'tab profile show': async (context) => {
    const result = await context.client.browser.tabProfileShow({
      ...(await resolveBrowserTarget(context)),
      page: requireBrowserFlag(context.args, 'page')
    })
    writeCliOutput(result, context.json, displayTabProfile(result))
  },
  'tab profile clone': async (context) => {
    const result = await context.client.browser.tabProfileClone({
      profileId: requireBrowserFlag(context.args, 'profile'),
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(result, context.json, displayClonedTab(result))
  }
}

function setTabProfile(useDefault: boolean): BrowserCliHandler {
  return async (context) => {
    const profileId = useDefault ? 'default' : requireBrowserFlag(context.args, 'profile')
    const result = await context.client.browser.tabSetProfile({
      profileId,
      ...(await resolveBrowserTarget(context))
    })
    writeCliOutput(
      result,
      context.json,
      translate(
        `Switched ${result.browserPageId} to ${result.profileLabel ?? result.profileId ?? 'Default'}`
      )
    )
  }
}

function parseProfileScope(value: string | undefined): 'isolated' | 'imported' {
  if (value === undefined || value === 'isolated') {
    return 'isolated'
  }
  if (value === 'imported') {
    return 'imported'
  }
  throw new Error('cli_flag_invalid:--scope')
}
