import { translate } from '~renderer/i18n/i18n'

import type { SettingsSearchEntry } from '../search'
import { translateSearchKeyword } from '../search-keywords'

export function getCoworkingSettingsSearchEntries(): SettingsSearchEntry[] {
  return [
    {
      title: translate(
        'auto.components.settings.CoworkingSettingsPane.searchTitle',
        'Authorized remote host clients'
      ),
      keywords: [
        ...translateSearchKeyword(
          'auto.components.settings.CoworkingSettingsPane.searchCoworking',
          'coworking'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.CoworkingSettingsPane.searchRemoteHost',
          'remote host'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.CoworkingSettingsPane.searchRevoke',
          'revoke'
        ),
        ...translateSearchKeyword(
          'auto.components.settings.CoworkingSettingsPane.searchAuthorizedDevices',
          'authorized devices'
        )
      ]
    }
  ]
}
