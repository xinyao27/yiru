import { createLocalizedCatalog } from '@/i18n/localized-catalog'

import { getBrowserPaneSearchEntries } from './browser-search'
import { getBrowserUsePaneSearchEntries } from './browser-use-search'
import type { SettingsSearchEntry } from './settings-search'

export const getBrowserPaneCombinedSearchEntries = createLocalizedCatalog(
  (): SettingsSearchEntry[] => [
    ...getBrowserUsePaneSearchEntries(),
    ...getBrowserPaneSearchEntries()
  ]
)
