import { mountDaemonSettings } from '@yiru/client/extension-settings'

import {
  readCommunityAdapters,
  removeCommunityAdapter,
  saveCommunityAdapter
} from '../browser/community-adapters'
import {
  clearDaemonConnectionSettings,
  readDaemonConnectionSettings,
  saveDaemonConnectionSettings
} from '../connection-settings'
import { readEnterprisePolicy } from '../enterprise-policy'

const [initialSettings, initialTrustedSites, initialCommunityAdapters, enterprisePolicy] =
  await Promise.all([
    readDaemonConnectionSettings(),
    readTrustedSites(),
    readCommunityAdapters(),
    readEnterprisePolicy()
  ])

mountDaemonSettings({
  communityAdaptersDisabled: enterprisePolicy.disableCommunityAdapters,
  initialCommunityAdapters,
  initialSettings,
  initialTrustedSites,
  onOpenUserScriptsSettings: async () => {
    await chrome.tabs.create({ url: `chrome://extensions/?id=${chrome.runtime.id}` })
  },
  onRemoveCommunityAdapter: removeCommunityAdapter,
  onReset: clearDaemonConnectionSettings,
  onRevokeSite: async (origin) => {
    await chrome.permissions.remove({ origins: [origin] })
  },
  onSave: async (settings) => {
    const endpoint = new URL(settings.endpoint)
    const healthOrigin = `${endpoint.protocol === 'wss:' ? 'https:' : 'http:'}//${endpoint.host}/*`
    const isBundledLoopback = ['127.0.0.1', 'localhost', '[::1]'].includes(
      endpoint.hostname.toLowerCase()
    )
    if (!isBundledLoopback) {
      const granted = await chrome.permissions.request({ origins: [healthOrigin] })
      if (!granted) {
        throw new Error('custom_daemon_origin_permission_denied')
      }
    }
    await saveDaemonConnectionSettings(settings)
  },
  onSaveCommunityAdapter: saveCommunityAdapter
})

async function readTrustedSites(): Promise<string[]> {
  const permissions = await chrome.permissions.getAll()
  return (permissions.origins ?? [])
    .filter((origin) => origin.startsWith('http://') || origin.startsWith('https://'))
    .toSorted()
}
