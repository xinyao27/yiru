import { createLocalizedCatalog } from '~renderer/i18n/localized-catalog'

import type { SettingsSearchEntry } from '../search'
import { getBrowserPaneSearchEntries } from './search'
import { getBrowserUsePaneSearchEntries } from './use-search'

export const getBrowserPaneCombinedSearchEntries = createLocalizedCatalog(
  (): SettingsSearchEntry[] => [
    ...getBrowserUsePaneSearchEntries(),
    ...getBrowserPaneSearchEntries()
  ]
)
