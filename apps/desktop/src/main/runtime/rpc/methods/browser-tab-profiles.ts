import { defineMethod, type RpcMethod } from '../core'
import {
  ProfileCreate,
  ProfileDelete,
  ProfileImportFromBrowser,
  TabClose,
  TabCreate,
  TabCurrent,
  TabList,
  TabProfileClone,
  TabSetProfile,
  TabShow,
  TabSwitch
} from './browser-schemas'

// Why: split out of browser-core.ts to stay under the 300-line ceiling once every
// method carries an `access` declaration. The seam is real — tabs and profiles are
// the browser's identity/session surface (which logged-in profile a page runs as),
// separate from page navigation and interaction.
export const BROWSER_TAB_PROFILE_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'browser.tabList',
    params: TabList,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserTabList(params)
  }),
  defineMethod({
    name: 'browser.tabShow',
    params: TabShow,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserTabShow(params)
  }),
  defineMethod({
    name: 'browser.tabCurrent',
    params: TabCurrent,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserTabCurrent(params)
  }),
  defineMethod({
    name: 'browser.tabSwitch',
    params: TabSwitch,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserTabSwitch(params)
  }),
  defineMethod({
    name: 'browser.tabCreate',
    mobile: true,
    params: TabCreate,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserTabCreate(params)
  }),
  defineMethod({
    name: 'browser.tabSetProfile',
    params: TabSetProfile,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserTabSetProfile(params)
  }),
  defineMethod({
    name: 'browser.tabProfileShow',
    params: TabShow,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserTabProfileShow(params)
  }),
  defineMethod({
    name: 'browser.tabProfileClone',
    params: TabProfileClone,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserTabProfileClone(params)
  }),
  defineMethod({
    name: 'browser.tabClose',
    params: TabClose,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserTabClose(params)
  }),
  defineMethod({
    name: 'browser.profileList',
    params: null,
    access: { scope: 'host', tier: 'host' },
    handler: async (_params, { browserCommands }) => browserCommands.browserProfileList()
  }),
  defineMethod({
    name: 'browser.profileCreate',
    params: ProfileCreate,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserProfileCreate(params)
  }),
  defineMethod({
    name: 'browser.profileDelete',
    params: ProfileDelete,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) => browserCommands.browserProfileDelete(params)
  }),
  defineMethod({
    name: 'browser.profileDetectBrowsers',
    params: null,
    access: { scope: 'host', tier: 'host' },
    handler: async (_params, { browserCommands }) => browserCommands.browserProfileDetectBrowsers()
  }),
  defineMethod({
    name: 'browser.profileImportFromBrowser',
    params: ProfileImportFromBrowser,
    access: { scope: 'host', tier: 'host' },
    handler: async (params, { browserCommands }) =>
      browserCommands.browserProfileImportFromBrowser(params)
  }),
  defineMethod({
    name: 'browser.profileClearDefaultCookies',
    params: null,
    access: { scope: 'host', tier: 'host' },
    handler: async (_params, { browserCommands }) =>
      browserCommands.browserProfileClearDefaultCookies()
  })
]
